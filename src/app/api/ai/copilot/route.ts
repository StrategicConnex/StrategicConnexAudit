import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { withRateLimit } from '@/shared/lib/ratelimit';
import { callAIWithFallback, getNoApiKeyResponse, AIMessage } from '@/server/ai/ai-router';

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
  async (req: NextRequest, _userId: string) => {
    try {
      const { messages, context, mode = 'copilot' } = await req.json();

      if (!messages || !Array.isArray(messages)) {
        return NextResponse.json({ success: false, error: 'Mensajes inválidos' }, { status: 400 });
      }

      // Build system prompt with mode context
      const basePrompt = mode === 'analyst'
        ? 'Eres un Analista de Ciberseguridad Senior (Blue Team / Threat Intelligence). Tu objetivo es analizar la superficie de ataque de infraestructura, logs y hallazgos técnicos. Eres altamente técnico, objetivo y vas directo al punto. Responde en un tono analítico y forense.'
        : 'Eres Strategic Copilot, un asistente IA Enterprise experto en Auditorías Técnicas, Ciberseguridad y Arquitectura. Tu misión es explicar problemas en lenguaje humano, priorizar tareas, generar planes de acción y sugerir fixes técnicos. Sé conciso, directo y usa un tono profesional de agencia.';

      const systemMsg: AIMessage = {
        role: 'system',
        content: `${basePrompt}\n\nContexto actual del objetivo analizado:\n${JSON.stringify(context || 'Sin contexto específico')}`
      };

      // Convert user messages to AIMessage format and prepend system
      const aiMessages: AIMessage[] = [
        systemMsg,
        ...messages.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content } as AIMessage))
      ];

      // Call AI with model pool and automatic fallback
      const aiResult = await callAIWithFallback({
        taskType: 'general-chat',
        messages: aiMessages,
        temperature: 0.4,
        maxTokens: 4096,
      });

      if (!aiResult.success) {
        return NextResponse.json({
          success: true,
          message: getNoApiKeyResponse('general-chat'),
          error: aiResult.error,
        });
      }

      return NextResponse.json({
        success: true,
        message: aiResult.content,
        modelUsed: aiResult.modelUsed,
        fromCache: aiResult.fromCache,
      });

    } catch (error) {
      const err = error as { message?: string };
      console.error('Error in Copilot endpoint:', error);
      return NextResponse.json({
        success: true,
        message: getNoApiKeyResponse('general-chat'),
        error: err.message || 'Servicio no disponible',
      });
    }
  }
);
