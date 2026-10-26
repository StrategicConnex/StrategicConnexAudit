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
import { buildCopilotSystemPrompt } from '@/server/ai/copilot-prompt';
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
function streamCopilotResponse(aiMessages: AIMessage[], userId: string): Promise<Response> {
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
      const { messages, context, mode = 'copilot', stream } = body ?? {};

      if (!messages || !Array.isArray(messages)) {
        return NextResponse.json({ success: false, error: 'Mensajes inválidos' }, { status: 400 });
      }

      // Prompt centralizado (grounding + anti-inyección), ver copilot-prompt.ts
      const systemMsg: AIMessage = {
        role: 'system',
        content: buildCopilotSystemPrompt(mode, context),
      };

      // Convert user messages to AIMessage format and prepend system
      const aiMessages: AIMessage[] = [
        systemMsg,
        ...messages.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content } as AIMessage))
      ];

      // ── Streaming (Sprint 1): respuestas progresivas por SSE ─────────────
      if (stream === true) {
        return await streamCopilotResponse(aiMessages, userId);
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
      });

      if (!aiResult.success) {
        // Único caso "blando": no hay ninguna clave configurada (onboarding).
        // Cualquier otro fallo (timeout, 429, circuito abierto, 5xx encadenado)
        // se devuelve como 503 para que el cliente lo distinga de una respuesta.
        return aiFailureResponse(aiResult.error ?? "AI pool unavailable", "pool");
      }

      return NextResponse.json({
        success: true,
        message: aiResult.content,
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
