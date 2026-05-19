import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceAssets,
  intelligenceRunEvents,
  intelligenceToolRuns
} from "@/shared/db/schemas";
import { createInvestigationSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { executeTool } from "@/server/intelligence/core/dispatcher";
import { calculateRiskScore } from "@/server/intelligence/core/risk-engine";

export const dynamic = "force-dynamic";

function getNormalizedHost(target: string): string {
  let host = target.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Continue on parsing error
    }
  } else if (host.includes("@")) {
    host = host.split("@")[1] || "";
  }
  return host.split(":")[0] || "";
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    const result = await withRLS(user.id, async (tx) => {
      if (investigationId) {
        const investigation = await tx.query.intelligenceInvestigations.findFirst({
          where: eq(intelligenceInvestigations.id, investigationId)
        });

        if (!investigation) {
          return { success: false, status: 404, error: "Investigación no encontrada" };
        }

        const findings = await tx.query.intelligenceFindings.findMany({
          where: eq(intelligenceFindings.investigationId, investigationId)
        });

        const events = await tx.query.intelligenceRunEvents.findMany({
          where: eq(intelligenceRunEvents.investigationId, investigationId),
          orderBy: [desc(intelligenceRunEvents.createdAt)]
        });

        const assets = await tx.query.intelligenceAssets.findMany({
          where: eq(intelligenceAssets.investigationId, investigationId)
        });

        return {
          success: true,
          status: 200,
          data: { investigation, findings, events, assets }
        };
      }

      if (!projectId) {
        return { success: false, status: 400, error: "Falta ID de proyecto" };
      }

      const list = await tx.query.intelligenceInvestigations.findMany({
        where: eq(intelligenceInvestigations.projectId, projectId),
        orderBy: [desc(intelligenceInvestigations.createdAt)]
      });

      return {
        success: true,
        status: 200,
        data: { investigations: list }
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result.data
    });
  } catch (error: any) {
    console.error("GET intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al obtener las investigaciones: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const body = await req.json();
    
    const parseResult = createInvestigationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Argumentos inválidos: " + parseResult.error.issues.map(i => i.message).join(", ") 
      }, { status: 400 });
    }

    const { projectId, target, template } = parseResult.data;

    // Check project authorization inside RLS context
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    const normalizedTarget = getNormalizedHost(target);

    // SSRF Prevention validation via Egress Guard
    try {
      await assertPublicHostname(normalizedTarget);
    } catch (ssrfError: any) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${ssrfError.message}`
      }, { status: 403 });
    }

    let targetType: "domain" | "hostname" | "url" | "ip" | "email" = "hostname";
    if (target.includes("@")) {
      targetType = "email";
    } else if (target.includes("://")) {
      targetType = "url";
    } else if (/^[0-9.]+$/.test(normalizedTarget) || normalizedTarget.includes(":")) {
      targetType = "ip";
    } else {
      targetType = "domain";
    }

    // Create investigation
    const investigation = await withRLS(user.id, async (tx) => {
      const [record] = await tx.insert(intelligenceInvestigations).values({
        projectId,
        ownerId: user.id,
        title: `Auditoría de Infraestructura para ${normalizedTarget}`,
        target,
        normalizedTarget,
        targetType,
        status: "running"
      }).returning();
      return record;
    });

    // Start background scan execution in a non-blocking promise thread
    (async () => {
      try {
        const toolsToRun = [
          { id: "dns.lookup", category: "network" },
          { id: "dns.mx", category: "network" },
          { id: "dns.txt", category: "network" },
          { id: "dns.ns", category: "network" },
          { id: "email.spf", category: "security" },
          { id: "email.dmarc", category: "security" },
          { id: "email.dkim", category: "security" },
          { id: "network.ping", category: "network" },
          { id: "network.reverse_dns", category: "network" },
          { id: "network.geoip", category: "network" },
          { id: "network.traceroute", category: "network" },
          { id: "network.asn", category: "network" },
          { id: "network.cdn", category: "network" },
          { id: "network.waf", category: "network" },
          { id: "network.reverse_ip", category: "network" },
          { id: "threat.ip_reputation", category: "security" },
          { id: "website.headers", category: "security" },
          { id: "website.security_headers", category: "security" },
          { id: "tls.scan", category: "security" },
          { id: "website.robots", category: "security" },
          { id: "osint.whois", category: "network" }
        ];

        const tStart = Date.now();
        const inMemoryEvents: Array<{ eventType: string; message: string; payload: any }> = [];
        const logEvent = (type: string, message: string, payload: any = {}) => {
          inMemoryEvents.push({ eventType: type, message, payload });
        };

        logEvent("info", `Iniciando Auditoría Técnica Avanzada modular para el host: ${normalizedTarget}`);
        logEvent("info", "Ejecutando suite de escaneos técnicos concurrentes...");

        // Dispatch tools execution
        const executionPromises = toolsToRun.map(async (tool) => {
          const toolStart = Date.now();
          try {
            const result = await executeTool(
              tool.id,
              normalizedTarget,
              { target: normalizedTarget },
              projectId,
              investigation.id,
              user.id
            );
            return {
              toolId: tool.id,
              category: tool.category,
              success: result.success,
              output: result.output,
              findings: result.findings || [],
              error: result.error || null,
              durationMs: Date.now() - toolStart
            };
          } catch (err: any) {
            return {
              toolId: tool.id,
              category: tool.category,
              success: false,
              output: {},
              findings: [],
              error: err.message || "Fallo inesperado de ejecución",
              durationMs: Date.now() - toolStart
            };
          }
        });

        const executionResults = await Promise.all(executionPromises);

        const allFindings: any[] = [];
        const toolRunRecords: any[] = [];

        for (const res of executionResults) {
          if (res.success) {
            logEvent("success", `Herramienta completada: ${res.toolId} (${res.durationMs}ms)`, { durationMs: res.durationMs });
          } else {
            logEvent("warning", `Error en herramienta: ${res.toolId} - ${res.error}`);
          }

          if (res.findings && res.findings.length > 0) {
            allFindings.push(...res.findings);
          }

          toolRunRecords.push({
            investigationId: investigation.id,
            projectId,
            toolId: res.toolId,
            category: res.category,
            status: res.success ? ("completed" as const) : ("failed" as const),
            input: { target: normalizedTarget },
            output: res.output,
            error: res.error,
            durationMs: res.durationMs,
            startedAt: new Date(tStart),
            completedAt: new Date()
          });
        }

        const { score, aggregatedFindings } = calculateRiskScore(allFindings);

        const emailFindings = aggregatedFindings.filter(f => (f.toolId ?? "").startsWith("email."));
        const infraFindings = aggregatedFindings.filter(f => !(f.toolId ?? "").startsWith("email."));

        const mailHealthScore = Math.max(10, 100 - emailFindings.reduce((acc, curr) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));
        const infraScore = Math.max(10, 100 - infraFindings.reduce((acc, curr) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));

        logEvent("success", `Auditoría completada. Puntuación Postura Global: ${score}/100. Infraestructura: ${infraScore}/100. Correo: ${mailHealthScore}/100.`);

        const dnsLookupResult = executionResults.find(r => r.toolId === "dns.lookup")?.output || {};
        const dnsMxResult = executionResults.find(r => r.toolId === "dns.mx")?.output || {};
        const dnsTxtResult = executionResults.find(r => r.toolId === "dns.txt")?.output || {};
        const dnsNsResult = executionResults.find(r => r.toolId === "dns.ns")?.output || {};
        const emailSpfResult = executionResults.find(r => r.toolId === "email.spf")?.output || {};
        const emailDmarcResult = executionResults.find(r => r.toolId === "email.dmarc")?.output || {};
        const emailDkimResult = executionResults.find(r => r.toolId === "email.dkim")?.output || {};
        const tlsScanResult = executionResults.find(r => r.toolId === "tls.scan")?.output || {};
        const whoisResult = executionResults.find(r => r.toolId === "osint.whois")?.output || {};
        const geoIpResult = executionResults.find(r => r.toolId === "network.geoip")?.output || {};
        const pingResult = executionResults.find(r => r.toolId === "network.ping")?.output || {};
        const reverseDnsResult = executionResults.find(r => r.toolId === "network.reverse_dns")?.output || {};
        const tracerouteResult = executionResults.find(r => r.toolId === "network.traceroute")?.output || {};
        const securityHeadersResult = executionResults.find(r => r.toolId === "website.security_headers")?.output || {};
        const asnResult = executionResults.find(r => r.toolId === "network.asn")?.output || {};
        const cdnResult = executionResults.find(r => r.toolId === "network.cdn")?.output || {};
        const wafResult = executionResults.find(r => r.toolId === "network.waf")?.output || {};
        const reverseIpResult = executionResults.find(r => r.toolId === "network.reverse_ip")?.output || {};
        const reputationResult = executionResults.find(r => r.toolId === "threat.ip_reputation")?.output || {};

        const primaryIp = dnsLookupResult.A?.[0] || null;

        await withRLS(user.id, async (tx) => {
          const insertedRuns = await tx.insert(intelligenceToolRuns).values(toolRunRecords).returning();
          const toolRunIdsMap = new Map<string, string>();
          for (const run of insertedRuns) {
            toolRunIdsMap.set(run.toolId, run.id);
          }

          if (aggregatedFindings.length > 0) {
            const findingsToInsert = aggregatedFindings.map(f => ({
              investigationId: investigation.id,
              toolRunId: toolRunIdsMap.get(f.toolId ?? "") ?? null,
              projectId,
              severity: f.severity as "info" | "low" | "medium" | "high" | "critical",
              confidence: String(Number(f.confidence) || 0.7),
              title: f.title,
              description: f.description,
              recommendation: f.remediation || f.recommendation || null,
              evidence: (f.evidence ?? {}) as Record<string, unknown>,
              affectedAsset: f.affectedAsset ?? null,
            }));
            await tx.insert(intelligenceFindings).values(findingsToInsert);
          }

          if (primaryIp) {
            await tx.insert(intelligenceAssets).values({
              projectId,
              investigationId: investigation.id,
              assetType: "ip_v4",
              value: primaryIp,
              ip: primaryIp
            }).onConflictDoUpdate({
              target: [intelligenceAssets.projectId, intelligenceAssets.assetType, intelligenceAssets.value],
              set: { lastSeenAt: new Date() }
            });
          }

          if (inMemoryEvents.length > 0) {
            await tx.insert(intelligenceRunEvents).values(
              inMemoryEvents.map(e => ({
                investigationId: investigation.id,
                eventType: e.eventType,
                message: e.message,
                payload: e.payload
              }))
            );
          }

          await tx.update(intelligenceInvestigations).set({
            status: "completed",
            score,
            summary: `Auditoría finalizada. Se detectaron ${aggregatedFindings.length} hallazgos. Puntuación de Postura: ${score}/100 (Correo: ${mailHealthScore}, Servidor: ${infraScore}).`,
            metadata: {
              mailHealthCompositeScore: mailHealthScore,
              infrastructureScore: infraScore,
              spfParsed: emailSpfResult.spfParsed || null,
              dmarcParsed: emailDmarcResult.dmarcParsed || null,
              dkimCount: emailDkimResult.count || 0,
              bimiSuccess: false,
              redirectsToHttps: securityHeadersResult.securityHeaders?.hsts ? true : false,
              whois: whoisResult,
              asnGeo: { ...geoIpResult, ...asnResult },
              reverseDns: reverseDnsResult.ptr || [],
              ping: pingResult,
              cdnWaf: {
                detected: cdnResult.detected || wafResult.detected || false,
                cdnProvider: cdnResult.provider || null,
                wafProvider: wafResult.wafProvider || null,
                cdnMethod: cdnResult.method || null,
                wafConfidence: wafResult.confidence || 0
              },
              reverseIp: reverseIpResult.domains || [],
              dnsbl: reputationResult.blacklistsListed || [],
              reputation: reputationResult,
              traceroute: tracerouteResult.hops || []
            },
            completedAt: new Date(),
            updatedAt: new Date()
          }).where(eq(intelligenceInvestigations.id, investigation.id));
        });

      } catch (backgroundError: any) {
        console.error("Background scanner execution failure:", backgroundError);
        try {
          await withRLS(user.id, async (tx) => {
            await tx.update(intelligenceInvestigations).set({
              status: "failed",
              summary: `Auditoría fallida debido a un error interno: ${backgroundError.message || backgroundError}`,
              updatedAt: new Date(),
              completedAt: new Date()
            }).where(eq(intelligenceInvestigations.id, investigation.id));

            await tx.insert(intelligenceRunEvents).values({
              investigationId: investigation.id,
              eventType: "error",
              message: `Error crítico de ejecución: ${backgroundError.message || backgroundError}`,
              payload: { error: backgroundError.stack || backgroundError }
            });
          });
        } catch (dbErr) {
          console.error("Failed to update background scan failure state in DB:", dbErr);
        }
      }
    })();

    return NextResponse.json({
      success: true,
      investigation: {
        id: investigation.id,
        title: investigation.title,
        target: investigation.target,
        normalizedTarget: investigation.normalizedTarget,
        status: "running",
        score: null,
      }
    });

  } catch (error: any) {
    console.error("POST intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al crear la investigación: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}
