import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceAssets,
  intelligenceRunEvents,
  intelligenceToolRuns
} from "@/shared/db/schemas";
import { checkIntelScanRateLimit } from "@/shared/lib/ratelimit";
import { createInvestigationSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { executeTool } from "@/server/intelligence/core/dispatcher";
import { calculateRiskScore } from "@/server/intelligence/core/risk-engine";
import type { Finding } from "@/server/intelligence/types/executor.types";
import { getErrorMessage } from "@/shared/lib/errors";

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
    });    } catch (error: unknown) {
    const msg = getErrorMessage(error);
    console.error("GET intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: msg === "No autorizado" ? "No autorizado" : "Error interno del servidor"
    }, { status: msg === "No autorizado" ? 401 : 500 });
  }
}

// ─── Tools que se ejecutan en cada escaneo ─────────────────────────
const TOOLS_TO_RUN = [
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

    const { projectId, target } = parseResult.data;

    // Rate Limiting específico para escaneos de infraestructura
    const rateLimit = await checkIntelScanRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Límite de escaneos de infraestructura excedido. Espera unos segundos e intenta de nuevo." 
      }, { status: 429 });
    }

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
    } catch (ssrfError: unknown) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${getErrorMessage(ssrfError)}`
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

    // ─── Background scan: aislamiento por fase ───────────────────
    (async () => {
      const errorLog: string[] = [];
      let phase = "inicialización";

      try {
        phase = "ejecución de herramientas";
        const tStart = Date.now();

        // Events acumulados en memoria
        const inMemoryEvents: Array<{ eventType: string; message: string; payload: Record<string, unknown> }> = [];
        const logEvent = (type: string, message: string, payload: Record<string, unknown> = {}) => {
          inMemoryEvents.push({ eventType: type, message, payload });
        };

        logEvent("info", `Iniciando auditoría para: ${normalizedTarget}`);
        logEvent("info", `Ejecutando ${TOOLS_TO_RUN.length} herramientas...`);

        // ── Fase 1: Ejecutar tools (cada una con su propio try/catch) ──
        const executionResults = await Promise.all(
          TOOLS_TO_RUN.map(async (tool) => {
            const toolStart = Date.now();
            try {
              const result = await executeTool(
                tool.id, normalizedTarget,
                { target: normalizedTarget },
                projectId, investigation.id, user.id
              );
              return {
                toolId: tool.id, category: tool.category,
                success: result.success, output: result.output,
                findings: result.findings || [],
                error: result.error || null,
                durationMs: Date.now() - toolStart
              };
            } catch (err: unknown) {
              const msg = err instanceof Error && err.message ? err.message : "Fallo inesperado";
              errorLog.push(`${tool.id}: ${msg}`);
              return {
                toolId: tool.id, category: tool.category,
                success: false, output: {}, findings: [],
                error: msg, durationMs: Date.now() - toolStart
              };
            }
          })
        );

        // Acumular resultados
        const allFindings: Finding[] = [];
        const toolRunRecords: Array<typeof intelligenceToolRuns.$inferInsert> = [];
        let toolsOk = 0, toolsFail = 0;

        for (const res of executionResults) {
          if (res.success) {
            toolsOk++;
            logEvent("success", `${res.toolId} completada (${res.durationMs}ms)`, { durationMs: res.durationMs });
          } else {
            toolsFail++;
            logEvent("warning", `${res.toolId} falló: ${res.error}`);
          }
          if (res.findings?.length) allFindings.push(...res.findings);
          toolRunRecords.push({
            investigationId: investigation.id, projectId,
            toolId: res.toolId, category: res.category,
            status: res.success ? "completed" as const : "failed" as const,
            input: { target: normalizedTarget },
            output: res.output, error: res.error,
            durationMs: res.durationMs,
            startedAt: new Date(tStart), completedAt: new Date()
          });
        }

        // ── Fase 2: Calcular risk score ──────────────────────────
        phase = "cálculo de puntuación";
        let score = 50;
        let aggregatedFindings: Finding[] = allFindings;

        try {
          const riskResult = calculateRiskScore(allFindings);
          score = riskResult.score;
          aggregatedFindings = riskResult.aggregatedFindings;
        } catch (riskErr: unknown) {
          const riskMsg = getErrorMessage(riskErr);
          errorLog.push(`risk-engine: ${riskMsg}`);
          logEvent("warning", `Error calculando score: ${riskMsg}`);
        }

        const emailFindings = aggregatedFindings.filter((f: Finding) => (f.toolId ?? "").startsWith("email."));
        const infraFindings = aggregatedFindings.filter((f: Finding) => !(f.toolId ?? "").startsWith("email."));
        const mailHealthScore = Math.max(10, 100 - emailFindings.reduce((acc: number, curr: Finding) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));
        const infraScore = Math.max(10, 100 - infraFindings.reduce((acc: number, curr: Finding) => acc + Math.round(Number(curr.scoreImpact || 0)), 0));

        logEvent("success", `Score: ${score}/100 | Correo: ${mailHealthScore} | Servidor: ${infraScore}`);

        // Extraer outputs para metadata
            const extract = (id: string): Record<string, unknown> =>
              (executionResults.find(r => r.toolId === id)?.output as Record<string, unknown> | undefined) ?? {};

        // ── Fase 3: Persistir en DB (con su propio try/catch) ────
        phase = "persistencia en base de datos";

        try {
          await withRLS(user.id, async (tx) => {
            // Tool runs
            const insertedRuns = await tx.insert(intelligenceToolRuns).values(toolRunRecords).returning();
            const runIds = new Map<string, string>();
            for (const run of insertedRuns) runIds.set(run.toolId, run.id);

            // Findings
            if (aggregatedFindings.length > 0) {
              await tx.insert(intelligenceFindings).values(
                aggregatedFindings.map((f: Finding) => ({
                  investigationId: investigation.id,
                  toolRunId: runIds.get(f.toolId ?? "") ?? null,
                  projectId,
                  severity: f.severity,
                  confidence: String(Number(f.confidence) || 0.7),
                  title: f.title, description: f.description,
                  recommendation: f.remediation || f.recommendation || null,
                  evidence: f.evidence ?? {},
                  affectedAsset: f.affectedAsset ?? null,
                }))
              );
            }

            // Assets
            const primaryIp = (extract("dns.lookup").A as string[] | undefined)?.[0] || null;
            if (primaryIp) {
              await tx.insert(intelligenceAssets).values({
                projectId, investigationId: investigation.id,
                assetType: "ip_v4", value: primaryIp, ip: primaryIp
              }).onConflictDoUpdate({
                target: [intelligenceAssets.projectId, intelligenceAssets.assetType, intelligenceAssets.value],
                set: { lastSeenAt: new Date() }
              });
            }

            // Events
            if (inMemoryEvents.length > 0) {
              await tx.insert(intelligenceRunEvents).values(
                inMemoryEvents.map(e => ({
                  investigationId: investigation.id,
                  eventType: e.eventType, message: e.message, payload: e.payload
                }))
              );
            }

            // Actualizar investigación
            const summaryParts = [
              `Auditoría finalizada. ${toolsOk}/${TOOLS_TO_RUN.length} herramientas completadas.`,
              `Score: ${score}/100. Hallazgos: ${aggregatedFindings.length}.`
            ];
            if (errorLog.length > 0) {
              summaryParts.push(`Errores: ${errorLog.slice(0, 5).join("; ")}`);
            }

            await tx.update(intelligenceInvestigations).set({
              status: "completed" as const,
              score,
              summary: summaryParts.join(" "),
              metadata: {
                mailHealthCompositeScore: mailHealthScore,
                infrastructureScore: infraScore,
                toolsCompleted: toolsOk,
                toolsFailed: toolsFail,
                spfParsed: extract("email.spf").spfParsed || null,
                dmarcParsed: extract("email.dmarc").dmarcParsed || null,
                dkimCount: extract("email.dkim").count || 0,
                bimiSuccess: false,
                redirectsToHttps: (extract("website.security_headers").securityHeaders as { hsts?: string } | undefined)?.hsts ? true : false,
                whois: extract("osint.whois"),
                asnGeo: { ...extract("network.geoip"), ...extract("network.asn") },
                reverseDns: extract("network.reverse_dns").ptr || [],
                ping: extract("network.ping"),
                cdnWaf: {
                  detected: extract("network.cdn").detected || extract("network.waf").detected || false,
                  cdnProvider: extract("network.cdn").provider || null,
                  wafProvider: extract("network.waf").wafProvider || null,
                  cdnMethod: extract("network.cdn").method || null,
                  wafConfidence: extract("network.waf").confidence || 0
                },
                reverseIp: extract("network.reverse_ip").domains || [],
                dnsbl: extract("threat.ip_reputation").blacklistsListed || [],
                reputation: extract("threat.ip_reputation"),
                traceroute: extract("network.traceroute").hops || []
              },
              completedAt: new Date(),
              updatedAt: new Date()
            }).where(eq(intelligenceInvestigations.id, investigation.id));
          });
        } catch (dbErr: unknown) {
          const dbMsg = getErrorMessage(dbErr);
          errorLog.push(`db: ${dbMsg}`);
          console.error("DB persistence failed in background scan:", dbErr);
          // Marcar como completado con advertencia (resultados parciales)
          await markInvestigationResult(investigation.id, user.id, {
            status: "failed",
            score,
            summary: `Finalizado con errores de persistencia: ${dbMsg}. ${toolsOk}/${TOOLS_TO_RUN.length} herramientas ejecutadas.`,
          }, errorLog);
        }

      } catch (backgroundError: unknown) {
        console.error(`Background scan failed (phase: ${phase}):`, backgroundError);
        const bgMsg = getErrorMessage(backgroundError);
        errorLog.push(`fase "${phase}": ${bgMsg}`);
        await markInvestigationResult(investigation.id, user.id, {
          status: "failed",
          score: null,
          summary: `Error en fase "${phase}": ${bgMsg}. ${errorLog.length > 0 ? `Detalles: ${errorLog.slice(0, 3).join("; ")}` : ""}`,
        }, errorLog);
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
    });    } catch (error: unknown) {
    const msg = getErrorMessage(error);
    console.error("POST intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: msg === "No autorizado" ? "No autorizado" : "Error interno del servidor"
    }, { status: msg === "No autorizado" ? 401 : 500 });
  }
}

/**
 * Helper para marcar el resultado de una investigación desde el background scan.
 * Aislado en su propia función con su propio try/catch para garantizar que
 * incluso si falla, no se pierde el estado de la investigación.
 */
async function markInvestigationResult(
  investigationId: string,
  userId: string,
  result: { status: "completed" | "failed"; score: number | null; summary: string },
  errorLog: string[]
) {
  try {
    await withRLS(userId, async (tx) => {
      await tx.update(intelligenceInvestigations).set({
        status: result.status,
        score: result.score,
        summary: result.summary,
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(intelligenceInvestigations.id, investigationId));

      await tx.insert(intelligenceRunEvents).values({
        investigationId,
        eventType: "error",
        message: result.summary,
        payload: { errors: errorLog }
      });
    });
  } catch (dbErr) {
    console.error("CRITICAL: Cannot update investigation status even in fallback:", dbErr);
  }
}
