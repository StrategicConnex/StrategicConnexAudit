import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations,
  intelligenceToolRuns,
  intelligenceFindings,
  intelligenceAssets,
  intelligenceRunEvents
} from "@/shared/db/schemas";
import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { checkAiRateLimit } from "@/shared/lib/ratelimit";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { executeTool } from "@/server/intelligence/core/dispatcher";
import { calculateRiskScore } from "@/server/intelligence/core/risk-engine";
import { Finding } from "@/server/intelligence/types/executor.types";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  target: z.string().min(1).max(2048),
  projectId: z.string().uuid()
});

// Normalizar host/dominio de entrada
function getNormalizedHost(target: string): string {
  let host = target.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Continuar si hay error de parseo
    }
  } else if (host.includes("@")) {
    host = host.split("@")[1] || "";
  }
  return host.split(":")[0] || "";
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

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
    console.error("GET intelligence failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error al obtener las investigaciones: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let createdInvestigationId: string | undefined = undefined;
  let loggedInUserId: string | undefined = undefined;

  try {
    // 1. Autenticar usuario
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    loggedInUserId = user.id;

    // 2. Validar entrada
    const body = await req.json();
    const parseResult = inputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { target, projectId } = parseResult.data;

    // 3. Validar autorización del proyecto mediante RLS
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // Rate Limiting
    const rateLimit = await checkAiRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Límite de solicitudes de IA excedido" }, { status: 429 });
    }

    // 4. Normalizar host y prevenir SSRF
    const normalizedTarget = getNormalizedHost(target);
    
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

    try {
      await assertPublicHostname(normalizedTarget);
    } catch (ssrfError: any) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${ssrfError.message}`
      }, { status: 403 });
    }

    console.log(`[Orchestrator] Iniciando auditoría integral modularizada para: ${normalizedTarget}`);

    // 5. Registrar la investigación con status "running"
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

    createdInvestigationId = investigation.id;
    const tStart = Date.now();

    // Eventos y tool runs acumulados en memoria para inserción masiva posterior
    const inMemoryEvents: Array<{ eventType: string; message: string; payload: any }> = [];
    const logEvent = (type: string, message: string, payload: any = {}) => {
      inMemoryEvents.push({ eventType: type, message, payload });
    };

    logEvent("info", `Iniciando Auditoría Técnica Avanzada modular para el host: ${normalizedTarget}`);

    // 6. Lanzar ejecución paralela controlada de las 16 herramientas de ciberseguridad
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
      { id: "website.headers", category: "security" },
      { id: "website.security_headers", category: "security" },
      { id: "tls.scan", category: "security" },
      { id: "website.robots", category: "security" },
      { id: "osint.whois", category: "network" }
    ];

    logEvent("info", "Ejecutando suite de escaneos técnicos concurrentes...");

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
          findings: [] as Finding[],
          error: err.message || "Fallo inesperado de ejecución",
          durationMs: Date.now() - toolStart
        };
      }
    });

    const executionResults = await Promise.all(executionPromises);

    // 7. Agrupar resultados y registrar eventos de éxito/error
    const allFindings: Finding[] = [];
    const toolRunRecords: any[] = [];

    for (const res of executionResults) {
      if (res.success) {
        logEvent("success", `Herramienta completada: ${res.toolId} (${res.durationMs}ms)`, { durationMs: res.durationMs });
      } else {
        logEvent("warning", `Error en herramienta: ${res.toolId} - ${res.error}`);
      }

      // Acumular hallazgos
      if (res.findings && res.findings.length > 0) {
        allFindings.push(...res.findings);
      }

      toolRunRecords.push({
        investigationId: investigation.id,
        projectId,
        toolId: res.toolId,
        category: res.category,
        status: res.success ? "completed" as const : "failed" as const,
        input: { target: normalizedTarget },
        output: res.output,
        error: res.error,
        durationMs: res.durationMs,
        startedAt: new Date(tStart),
        completedAt: new Date()
      });
    }

    // 8. Calcular el Puntuación global y por componente utilizando el Risk Engine
    const { score, deductions, aggregatedFindings } = calculateRiskScore(allFindings);

    // Mapear los sub-scores por categoría para mantener compatibilidad
    // infraScore: basado en red y website; mailHealthScore: basado en email
    const emailFindings = aggregatedFindings.filter(f => (f.toolId ?? "").startsWith("email."));
    const infraFindings = aggregatedFindings.filter(f => !(f.toolId ?? "").startsWith("email."));

    const mailHealthScore = Math.max(10, 100 - emailFindings.reduce((acc, curr) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));
    const infraScore = Math.max(10, 100 - infraFindings.reduce((acc, curr) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));

    logEvent("success", `Auditoría completada. Puntuación Postura Global: ${score}/100. Infraestructura: ${infraScore}/100. Correo: ${mailHealthScore}/100.`);

    // 9. Extraer datos individuales para mantener compatibilidad visual estricta con el Frontend anterior
    const dnsLookupResult = executionResults.find(r => r.toolId === "dns.lookup")?.output || {};
    const dnsMxResult = executionResults.find(r => r.toolId === "dns.mx")?.output || {};
    const dnsTxtResult = executionResults.find(r => r.toolId === "dns.txt")?.output || {};
    const dnsNsResult = executionResults.find(r => r.toolId === "dns.ns")?.output || {};
    const emailSpfResult = executionResults.find(r => r.toolId === "email.spf")?.output || {};
    const emailDmarcResult = executionResults.find(r => r.toolId === "email.dmarc")?.output || {};
    const emailDkimResult = executionResults.find(r => r.toolId === "email.dkim")?.output || {};
    const tlsScanResult = executionResults.find(r => r.toolId === "tls.scan")?.output || {};
    const headersResult = executionResults.find(r => r.toolId === "website.headers")?.output || {};
    const securityHeadersResult = executionResults.find(r => r.toolId === "website.security_headers")?.output || {};
    const whoisResult = executionResults.find(r => r.toolId === "osint.whois")?.output || {};
    const geoIpResult = executionResults.find(r => r.toolId === "network.geoip")?.output || {};
    const pingResult = executionResults.find(r => r.toolId === "network.ping")?.output || {};
    const reverseDnsResult = executionResults.find(r => r.toolId === "network.reverse_dns")?.output || {};
    const tracerouteResult = executionResults.find(r => r.toolId === "network.traceroute")?.output || {};

    const primaryIp = dnsLookupResult.A?.[0] || null;

    // 10. Persistencia atómica de todos los registros en base de datos mediante RLS
    await withRLS(user.id, async (tx) => {
      // A. Insertar registros de ejecución de herramientas
      const insertedRuns = await tx.insert(intelligenceToolRuns).values(toolRunRecords).returning();
      const toolRunIdsMap = new Map<string, string>();
      for (const run of insertedRuns) {
        toolRunIdsMap.set(run.toolId, run.id);
      }

      // B. Insertar los hallazgos correlacionados y agregados
      if (aggregatedFindings.length > 0) {
        const findingsToInsert = aggregatedFindings.map(f => ({
          investigationId: investigation.id,
          toolRunId: toolRunIdsMap.get(f.toolId ?? "") ?? null,
          projectId,
          severity: f.severity,
          confidence: String(Number(f.confidence) || 0.7),
          title: f.title,
          description: f.description,
          recommendation: f.remediation || f.recommendation || null,
          evidence: (f.evidence ?? {}) as Record<string, unknown>,
          affectedAsset: f.affectedAsset ?? null,
        }));
        await tx.insert(intelligenceFindings).values(findingsToInsert);
      }

      // C. Guardar IPs descubiertas como activos persistentes del proyecto
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

      // D. Guardar los eventos del ciclo de vida acumulados
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

      // E. Finalizar investigación principal con metadata enriquecida
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
          // Datos de red e infraestructura geolocalizada
          whois: whoisResult,
          asnGeo: geoIpResult,
          reverseDns: reverseDnsResult.ptr || [],
          ping: pingResult,
          cdnWaf: securityHeadersResult.cdnWaf || { detected: false, name: null, provider: null },
          reverseIp: [],
          dnsbl: [],
          traceroute: tracerouteResult.hops || []
        },
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(intelligenceInvestigations.id, investigation.id));
    });

    // 11. Responder estructuradamente con mapeo de compatibilidad UI
    return NextResponse.json({
      success: true,
      investigation: {
        id: investigation.id,
        title: investigation.title,
        target,
        normalizedTarget,
        targetType,
        score,
        status: "completed",
        summary: `Puntuación de Seguridad de Infraestructura: ${score}/100. Correo: ${mailHealthScore}/100. Servidor: ${infraScore}/100.`,
        metadata: {
          mailHealthCompositeScore: mailHealthScore,
          infrastructureScore: infraScore
        }
      },
      dns: {
        A: dnsLookupResult.A || [],
        AAAA: dnsLookupResult.AAAA || [],
        MX: dnsMxResult.MX || [],
        NS: dnsNsResult.NS || [],
        TXT: dnsTxtResult.TXT || []
      },
      ssl: tlsScanResult,
      email: {
        spf: emailSpfResult.record || null,
        spfParsed: emailSpfResult.spfParsed || null,
        dmarc: emailDmarcResult.record || null,
        dmarcParsed: emailDmarcResult.dmarcParsed || null,
        dkim: emailDkimResult,
        bimi: { success: false, error: "No configurado" }
      },
      headers: headersResult,
      redirect: { success: true, redirectsToHttps: securityHeadersResult.securityHeaders?.hsts ? true : false },
      findings: aggregatedFindings
    });

  } catch (error: any) {
    console.error("[Orchestrator Failure] Diagnostic engine execution failure:", error);
    
    // Tratamiento resiliente ante fallos de ejecución: marcar como fallido
    if (createdInvestigationId && loggedInUserId) {
      const invId = createdInvestigationId;
      const userId = loggedInUserId;
      try {
        await withRLS(userId, async (tx) => {
          await tx.update(intelligenceInvestigations).set({
            status: "failed",
            summary: `Auditoría fallida debido a un error interno: ${error.message || error}`,
            updatedAt: new Date(),
            completedAt: new Date()
          }).where(eq(intelligenceInvestigations.id, invId));

          await tx.insert(intelligenceRunEvents).values({
            investigationId: invId,
            eventType: "error",
            message: `Error crítico de ejecución: ${error.message || error}`,
            payload: { error: error.stack || error }
          });
        });
      } catch (dbErr) {
        console.error("Failed to update failed state in DB:", dbErr);
      }
    }

    return NextResponse.json({
      success: false,
      error: `Error interno de ejecución diagnóstica: ${error.message || error}`
    }, { status: 500 });
  }
}
