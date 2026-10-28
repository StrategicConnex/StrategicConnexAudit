import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { withRateLimit } from '@/shared/lib/ratelimit';
import {
  callAIWithFallback,
  callAIWithFallbackStream,
  getNoApiKeyResponse,
  AIMessage,
  type AIStreamResult,
} from '@/server/ai/ai-router';
import { assertAiQuota } from '@/server/ai/ai-usage';
import {
  buildConversationMessages,
  buildCopilotSystemPrompt,
  truncateConversationHistory,
  type ConversationTurn,
} from '@/server/ai/copilot-prompt';
import { loadIntelligenceCopilotContext } from '@/server/ai/intelligence-context';
import { parseCitations, toCitedFindings, type CitedFinding } from '@/server/ai/citations';
import { buildCriticalSuggestion, toSuggestionFindings } from '@/server/ai/chat-suggestions';
import { recordUnverifiedCitations } from '@/server/observability/chat-telemetry';
import { getLocale, getMessages } from '@/i18n/request';
import type { ChatSuggestion } from '@/shared/types/chat';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

// Cadena de hasta 5 modelos × 20s = 100s peor caso. Sin maxDuration, Vercel
// mata la función a los 10s (Hobby) o 60s (Pro) y el copilot se queda sin
// respuesta.
export const maxDuration = 120;

/** ¿El error es "ningún proveedor de IA configurado" (onboarding) o una incidencia? */
function isMissingKeyError(error: string): boolean {
  return /not configured|no configurada|ninguna clave/i.test(error);
}

/**
 * Falla blanda (onboarding → 200) o dura (503) con el MISMO contrato JSON de
 * siempre. Compartida por el camino no-stream y por el streaming sin chunks,
 * de modo que ambos respondan idéntico ante un fallo del pool.
 */
function aiFailureResponse(error: string, kind: "pool" | "infra"): NextResponse {
  if (isMissingKeyError(error)) {
    return NextResponse.json({
      success: true,
      message: getNoApiKeyResponse('general-chat'),
      error,
    });
  }
  return NextResponse.json(
    {
      success: false,
      error,
      message:
        kind === "pool"
          ? "## ⚠️ Motor de IA temporalmente no disponible\n\n" +
            "El pool de IA (OpenRouter + failover Groq/Gemini) no devolvió " +
            "respuesta para esta consulta. No es un problema de tu configuración: " +
            "reintenta en unos momentos.\n\n" +
            `**Detalle técnico:** ${error}`
          : "## ⚠️ Servicio temporalmente no disponible\n\n" +
            "No se pudo procesar la consulta con el motor de IA. Reintenta en " +
            "unos momentos; si persiste, revisa el estado del pool en /ai/health.\n\n" +
            `**Detalle técnico:** ${error}`,
      modelUsed: null,
    },
    { status: 503 },
  );
}

/**
 * Respuesta en streaming (Sprint 1): SSE con eventos
 *   data: {"type":"chunk","text":"…"}       — delta de texto del modelo
 *   data: {"type":"done","modelUsed":"…","fromCache":false}
 *   data: {"type":"error","message":"…"}
 *
 * El primer chunk "abre" el stream (200 + text/event-stream). Si el router
 * falla SIN emitir ni un chunk (pool caído, onboarding, etc.) se responde
 * JSON con el contrato histórico: el cliente distingue por Content-Type.
 */
function streamCopilotResponse(
  aiMessages: AIMessage[],
  userId: string,
  disableSemanticCache: boolean,
  validatedFindings: CitedFinding[],
  suggestion: ChatSuggestion | null,
  correlationId: string,
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
      taskType: "general-chat",
      userId,
      // F-SCOPE: mismo scope por tenant que el camino no-stream.
      cacheScope: `user:${userId}`,
      messages: aiMessages,
      temperature: 0.4,
      maxTokens: 4096,
      disableSemanticCache,
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
      // C4/C6: el stream entrega deltas crudos; al cerrar se validan las citas
      // contra el conjunto RLS y se envían solo los metadatos necesarios. Un
      // `done` sin referencias ni sugerencia conserva exactamente el contrato
      // anterior (modelUsed/fromCache).
      const cited = parseCitations(result.content ?? "", validatedFindings);
      if (cited.unverifiedCount > 0) {
        void recordUnverifiedCitations({
          correlationId,
          taskType: "general-chat",
          count: cited.unverifiedCount,
        }).catch(() => {
          // La telemetría nunca debe romper una respuesta ya emitida.
        });
      }
      send({
        type: "done",
        modelUsed: result.modelUsed,
        fromCache: result.fromCache ?? false,
        ...(cited.references.length > 0 ? { references: cited.references } : {}),
        ...(cited.unverifiedCount > 0 ? { unverifiedCount: cited.unverifiedCount } : {}),
        ...(suggestion ? { suggestion } : {}),
      });
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
          // Los proxies (Cloudflare) bufferizan el SSE sin esto y el texto
          // llegaría de golpe al final, matando el streaming.
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
    return aiFailureResponse(result.error ?? "AI pool unavailable", "pool");
  });
}

export const POST = withRateLimit(
  {
    limit: 5,
    window: 60,
    prefix: "ai_copilot",
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    }
  },
  async (req: NextRequest, userId: string) => {
    try {
      // Cuota diaria P0-1: antes de cualquier trabajo costoso
      const quota = await assertAiQuota(userId, "general-chat");
      if (quota) return quota;

      const body = await req.json().catch(() => null);
      const { messages, context, mode = 'copilot', stream, intelligenceContext } = body ?? {};

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ success: false, error: 'Mensajes inválidos' }, { status: 400 });
      }

      // La historia la controla el cliente: no se confía en su forma ni en su
      // contenido. Solo se aceptan turnos user/assistant y la conversación
      // debe terminar en una pregunta del usuario (nunca en un turno assistant
      // que pudiera actuar como instrucción de cierre).
      const isChatRole = (role: unknown): role is 'user' | 'assistant' =>
        role === 'user' || role === 'assistant';
      const validTurns = messages.every((m: unknown) => {
        if (!m || typeof m !== 'object') return false;
        const turn = m as { role?: unknown; content?: unknown };
        return (
          isChatRole(turn.role) &&
          typeof turn.content === 'string' &&
          turn.content.trim().length > 0
        );
      });
      const lastTurn = messages[messages.length - 1] as { role?: unknown } | undefined;
      if (!validTurns || lastTurn?.role !== 'user') {
        return NextResponse.json({ success: false, error: 'Mensajes inválidos' }, { status: 400 });
      }

      let promptContext = context;
      let promptMode = mode;
      // Solo los hallazgos resueltos por el loader (RLS) pueden citarse.
      let validatedFindings: CitedFinding[] = [];
      if (intelligenceContext !== undefined) {
        const ids = intelligenceContext as {
          projectId?: unknown;
          investigationId?: unknown;
          findingId?: unknown;
        };
        const isUuid = (value: unknown): value is string =>
          typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

        if (
          !ids || typeof ids !== 'object' || Array.isArray(ids) ||
          (ids.projectId !== undefined && !isUuid(ids.projectId)) ||
          (ids.investigationId !== undefined && !isUuid(ids.investigationId)) ||
          (ids.findingId !== undefined && !isUuid(ids.findingId)) ||
          Object.keys(ids).some(
            (key) => key !== 'projectId' && key !== 'investigationId' && key !== 'findingId',
          )
        ) {
          return NextResponse.json({ success: false, error: 'Contexto de Intelligence inválido' }, { status: 400 });
        }

        const resolvedContext = await loadIntelligenceCopilotContext(userId, {
          projectId: ids.projectId as string | undefined,
          investigationId: ids.investigationId as string | undefined,
          findingId: ids.findingId as string | undefined,
        });
        if (!resolvedContext) {
          return NextResponse.json(
            { success: false, error: 'Recurso de Intelligence no encontrado o acceso denegado' },
            { status: 404 },
          );
        }
        // Nunca usar el objeto `context` ni el modo enviado por el navegador en este flujo.
        promptContext = resolvedContext;
        promptMode = 'analyst';
        validatedFindings = toCitedFindings(resolvedContext);
      }

      // Sugerencia proactiva: plantilla localizada en servidor, solo para
      // hallazgos críticos ≤7 días. El cliente aplica frecuencia y descarte.
      let suggestion: ChatSuggestion | null = null;
      if (intelligenceContext !== undefined && validatedFindings.length > 0) {
        const locale = await getLocale();
        const i18nMessages = await getMessages(locale);
        const resolved = promptContext as Record<string, unknown>;
        const investigation = resolved["investigation"];
        const investigationId =
          investigation && typeof investigation === "object" &&
          typeof (investigation as { id?: unknown }).id === "string"
            ? (investigation as { id: string }).id
            : null;

        suggestion = buildCriticalSuggestion({
          findings: [
            ...toSuggestionFindings(resolved["findings"]),
            ...toSuggestionFindings([resolved["selectedFinding"]]),
          ],
          investigationId,
          locale,
          messages: i18nMessages as Record<string, unknown>,
        });
      }

      // Prompt centralizado (grounding + anti-inyección), ver copilot-prompt.ts
      const systemMsg: AIMessage = {
        role: 'system',
        content: buildCopilotSystemPrompt(promptMode, promptContext),
      };

      // Presupuesto de historial impuesto por el servidor: después de validar
      // roles y antes del scrub. Un cliente craftado no puede inflar el prompt.
      const truncated = truncateConversationHistory(messages as ConversationTurn[]);

      // Scrub server-side + delimitación como DATOS de los turnos previos.
      // El último turno del usuario queda sin envolver: es la instrucción.
      const conversation = buildConversationMessages(truncated);
      const aiMessages: AIMessage[] = [systemMsg, ...conversation];

      // C3: un turno con historia no puede reutilizar ni contaminar la caché
      // semántica de primeros turnos. Se cuenta el número de turnos de USUARIO:
      // el saludo sintético del asistente no convierte el primer turno en
      // historia. El primer turno sigue tenant-scoped cacheable.
      const userTurns = conversation.filter((turn) => turn.role === "user").length;
      const disableSemanticCache = userTurns > 1;

      // ── Streaming (Sprint 1): respuestas progresivas por SSE ─────────────
      if (stream === true) {
        const correlationId = req.headers.get("x-request-id") ?? globalThis.crypto.randomUUID();
        return await streamCopilotResponse(
          aiMessages,
          userId,
          disableSemanticCache,
          validatedFindings,
          suggestion,
          correlationId,
        );
      }

      // Call AI with model pool and automatic fallback
      const aiResult = await callAIWithFallback({
        taskType: 'general-chat',
        userId,
        // F-SCOPE (follow-up T3): scope por tenant — la clave L1/L2 nunca es
        // "global" y dos usuarios no comparten respuestas cacheadas.
        cacheScope: `user:${userId}`,
        messages: aiMessages,
        temperature: 0.4,
        maxTokens: 4096,
        disableSemanticCache,
      });

      if (!aiResult.success) {
        // Único caso "blando": no hay ninguna clave configurada (onboarding).
        // Cualquier otro fallo (timeout, 429, circuito abierto, 5xx encadenado)
        // se devuelve como 503 para que el cliente lo distinga de una respuesta.
        return aiFailureResponse(aiResult.error ?? "AI pool unavailable", "pool");
      }

      // Citas: el cotejo ocurre en servidor contra el conjunto validado por
      // RLS. Un marcador sin match queda como texto plano y se cuenta.
      const cited = parseCitations(aiResult.content ?? "", validatedFindings);
      if (cited.unverifiedCount > 0) {
        const correlationId = req.headers.get("x-request-id") ?? globalThis.crypto.randomUUID();
        await recordUnverifiedCitations({
          correlationId,
          taskType: "general-chat",
          count: cited.unverifiedCount,
        });
      }

      return NextResponse.json({
        success: true,
        message: cited.text,
        references: cited.references,
        unverifiedCount: cited.unverifiedCount,
        suggestion,
        modelUsed: aiResult.modelUsed,
        fromCache: aiResult.fromCache,
      });

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error in Copilot endpoint:', error);
      // Catch de infraestructura (auth, quota, rate limit, DB): NO es lo mismo
      // que "IA sin configurar". Solo mapea al onboarding si el error real lo
      // indica; el resto es una incidencia transitoria del servicio.
      return aiFailureResponse(errMsg || 'Servicio no disponible', "infra");
    }
  }
);
