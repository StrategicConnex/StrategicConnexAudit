import { NextRequest, NextResponse } from "next/server";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations, intelligenceFindings } from "@/shared/db/schemas";
import { asc, count, eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRateLimit } from "@/shared/lib/ratelimit";
import {
  callAIWithFallback,
  callAIWithFallbackStream,
  AIMessage,
  type AIStreamResult,
} from "@/server/ai/ai-router";
import { assertAiQuota } from "@/server/ai/ai-usage";
import { getErrorMessage } from "@/shared/lib/errors";
import { logger } from "@/lib/logger";
import { getLocale, getMessages } from "@/i18n/request";

export const dynamic = "force-dynamic";

// Cadena de hasta 5 modelos × 20s = 100s peor caso. Sin maxDuration, Vercel
// mata la función a los 10s (Hobby) o 60s (Pro) y el copilot se queda sin
// plan de remediación.
export const maxDuration = 120;

const COPILOT_FINDINGS_LIMIT = 100;

/**
 * Respuesta en streaming del plan de remediación: SSE con eventos
 *   data: {"type":"chunk","text":"…"}       — delta Markdown del plan
 *   data: {"type":"done","modelUsed":"…","fromCache":false}
 *   data: {"type":"error","message":"…"}
 *
 * El primer chunk abre el stream (200 + text/event-stream). Si el pool falla
 * SIN emitir ni un chunk se responde el JSON legado de error: el cliente
 * distingue por Content-Type. `done` es terminal y NO contiene el plan; el
 * cliente lo reconstruye concatenando los chunks.
 */
function streamRemediationResponse(
  aiMessages: AIMessage[],
  userId: string,
): Promise<Response> {
  const encoder = new TextEncoder();
  let started = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let resolveStart: (stream: ReadableStream<Uint8Array> | null) => void = () => {};
  const startPromise = new Promise<ReadableStream<Uint8Array> | null>((resolve) => {
    resolveStart = resolve;
  });

  const send = (event: Record<string, unknown>): void => {
    try {
      controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Cliente desconectado: no hay a quién entregar, se ignora.
    }
  };

  const resultPromise = callAIWithFallbackStream(
    {
      taskType: "copilot-remediation",
      userId,
      // F-SCOPE (follow-up T3): el prompt incrusta evidencia del tenant;
      // mismo scope por usuario que el camino no-stream.
      cacheScope: `user:${userId}`,
      messages: aiMessages,
      temperature: 0.3,
      maxTokens: 4096,
    },
    (text) => {
      if (!started) {
        started = true;
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
          },
        });
        resolveStart(stream);
      }
      send({ type: "chunk", text });
    },
  );

  const settle = (result: AIStreamResult): void => {
    if (!started) {
      resolveStart(null);
      return;
    }
    if (result.success) {
      send({ type: "done", modelUsed: result.modelUsed, fromCache: result.fromCache ?? false });
    } else {
      send({ type: "error", message: result.error ?? "AI pool unavailable" });
    }
    try {
      controller?.close();
    } catch {
      // Stream ya cerrado/cancelado.
    }
  };

  void resultPromise.then(settle, (err: unknown) => {
    settle({
      success: false,
      content: "",
      modelUsed: "none",
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return startPromise.then(async (stream) => {
    if (stream) {
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          // Sin esto los proxies bufferizan el SSE y el plan llega de golpe.
          "X-Accel-Buffering": "no",
        },
      });
    }
    let result: AIStreamResult;
    try {
      result = await resultPromise;
    } catch (err) {
      result = {
        success: false,
        content: "",
        modelUsed: "none",
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return NextResponse.json({
      success: false,
      hasFindings: true,
      error: result.error ?? "AI pool unavailable",
    }, { status: 503 });
  });
}


export const POST = withRateLimit(
  {
    limit: 5,
    window: 60,
    prefix: "intel_copilot",
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    }
  },
  async (req: NextRequest, _userId: string) => {
    try {
      // Cuota diaria P0-1: antes de cualquier trabajo costoso
      const quota = await assertAiQuota(_userId, "copilot-remediation");
      if (quota) return quota;

      const { investigationId, stream } = await req.json();
      if (!investigationId) {
        return NextResponse.json({ success: false, error: "Falta ID de investigación" }, { status: 400 });
      }

      // Fetch investigation and associated findings using user-scoped context (RLS)
      const dbResult = await withRLS(_userId, async (tx) => {
        const investigationRecord = await tx.query.intelligenceInvestigations.findFirst({
          where: eq(intelligenceInvestigations.id, investigationId)
        });

        if (!investigationRecord) return null;

        const severityRows = await tx
          .select({ severity: intelligenceFindings.severity, n: count() })
          .from(intelligenceFindings)
          .where(eq(intelligenceFindings.investigationId, investigationId))
          .groupBy(intelligenceFindings.severity);

        const findingsRecords = await tx.query.intelligenceFindings.findMany({
          where: eq(intelligenceFindings.investigationId, investigationId),
          orderBy: [asc(intelligenceFindings.severity), asc(intelligenceFindings.title)],
          limit: COPILOT_FINDINGS_LIMIT,
        });

        return { investigation: investigationRecord, severityRows, findings: findingsRecords };
      });

      if (!dbResult) {
        return NextResponse.json({ success: false, error: "Investigación no encontrada o acceso denegado" }, { status: 404 });
      }

      const { investigation, severityRows, findings } = dbResult;
      const totalFindings = severityRows.reduce((sum, r) => sum + Number(r.n), 0);

      if (totalFindings === 0) {
        const locale = await getLocale();
        const messages = await getMessages(locale);

        return NextResponse.json({
          success: true,
          hasFindings: false,
          // Mensaje de ausencia, no un plan: no afirmamos que la
          // infraestructura esté limpia si todavía no se ha escaneado.
          remediationPlan: messages.intelligence.copilotNoFindings,
          action: {
            href: "/intelligence#intelligence-scan",
            label: messages.intelligence.copilotRunScan,
          },
        });
      }

      // Build AI messages
      const systemMsg: AIMessage = {
        role: "system",
        content: "Eres Infrastructure Intelligence Copilot, un asistente de IA de nivel Enterprise experto en seguridad en la nube (AWS, Azure, GCP), arquitectura de redes, TLS/SSL, administración de DNS y seguridad de correo electrónico (SPF/DMARC/DKIM).\nTu misión es procesar una lista de hallazgos y vulnerabilidades técnicas encontradas en un host, evaluar el riesgo real en términos claros para directores de tecnología, y generar un PLAN DE REMEDIACIÓN PASO A PASO con comandos técnicos exactos (ej. OpenSSL, DNS records, configuraciones de Nginx o reglas de Cloudflare).\nResponde siempre en ESPAÑOL y usa un tono profesional de consultoría de élite."
      };

      const userMsg: AIMessage = {
        role: "user",
        content: `Por favor genera un plan de remediación técnica interactivo para el host "${investigation.target}" (Tipo de objetivo: ${investigation.targetType}).\nLa postura de seguridad calculada es: ${investigation.score}/100.\n\nHallazgos de seguridad encontrados: ${totalFindings}${findings.length < totalFindings ? ` (mostrando ${findings.length} de mayor severidad)` : ""}:\n${findings.map((f, i) => `${i + 1}. [Severidad: ${f.severity.toUpperCase()}] **${f.title}**\n   - Descripción: ${f.description}\n   - Recomendación inicial: ${f.recommendation}\n   - Evidencia técnica: ${JSON.stringify(f.evidence)}`).join("\n\n")}`
      };

      // ── Streaming (Sprint 2, C5): plan progresivo por SSE ───────────────
      // El path sin flag conserva el JSON con `remediationPlan` estructurado.
      if (stream === true) {
        return await streamRemediationResponse([systemMsg, userMsg], _userId);
      }

      // Call AI with model pool and automatic fallback
      const aiResult = await callAIWithFallback({
        taskType: "copilot-remediation",
        userId: _userId,
        // F-SCOPE (follow-up T3): el prompt incrusta evidencia del tenant —
        // sin scope estaría cacheable bajo "global" cross-tenant en el L2.
        cacheScope: `user:${_userId}`,
        messages: [systemMsg, userMsg],
        temperature: 0.3,
        maxTokens: 4096,
      });

      if (!aiResult.success) {
        return NextResponse.json({
          success: false,
          hasFindings: true,
          error: aiResult.error,
        }, { status: 503 });
      }

      return NextResponse.json({
        success: true,
        hasFindings: true,
        remediationPlan: aiResult.content,
        modelUsed: aiResult.modelUsed,
        fromCache: aiResult.fromCache,
      });

    } catch (error: unknown) {
      logger.error("Infrastructure Copilot execution failure:", { error: getErrorMessage(error) })
      return NextResponse.json(
        {
          success: false,
          error: getErrorMessage(error),
        },
        { status: 500 }
      );
    }
  }
);
