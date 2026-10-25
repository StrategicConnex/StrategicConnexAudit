import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { withRateLimit } from '@/shared/lib/ratelimit';
import { callAIWithFallback, getNoApiKeyResponse, AIMessage } from '@/server/ai/ai-router';
import { assertAiQuota } from '@/server/ai/ai-usage';
import { buildCopilotSystemPrompt } from '@/server/ai/copilot-prompt';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

// Cadena de hasta 5 modelos × 20s = 100s peor caso. Sin maxDuration, Vercel
// mata la función a los 10s (Hobby) o 60s (Pro) y el copilot se queda sin
// respuesta.
export const maxDuration = 120;

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
      const { messages, context, mode = 'copilot' } = body ?? {};

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
        const missingKey =
          /not configured|no configurada|ninguna clave/i.test(aiResult.error ?? "");
        if (missingKey) {
          return NextResponse.json({
            success: true,
            message: getNoApiKeyResponse('general-chat'),
            error: aiResult.error,
          });
        }
        return NextResponse.json({
          success: false,
          error: aiResult.error ?? "AI pool unavailable",
          message: "## ⚠️ Motor de IA temporalmente no disponible\n\n" +
            "El pool de IA (OpenRouter + failover Groq/Gemini) no devolvió " +
            "respuesta para esta consulta. No es un problema de tu configuración: " +
            "reintenta en unos momentos.\n\n" +
            `**Detalle técnico:** ${aiResult.error ?? "desconocido"}`,
          modelUsed: null,
        }, { status: 503 });
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
      const missingKey = /not configured|no configurada|ninguna clave/i.test(errMsg);
      if (missingKey) {
        return NextResponse.json({
          success: true,
          message: getNoApiKeyResponse('general-chat'),
          error: errMsg,
        });
      }
      return NextResponse.json({
        success: false,
        error: errMsg || 'Servicio no disponible',
        message: "## ⚠️ Servicio temporalmente no disponible\n\n" +
          "No se pudo procesar la consulta con el motor de IA. Reintenta en " +
          "unos momentos; si persiste, revisa el estado del pool en /ai/health.\n\n" +
          `**Detalle técnico:** ${errMsg || "desconocido"}`,
        modelUsed: null,
      }, { status: 503 });
    }
  }
);
