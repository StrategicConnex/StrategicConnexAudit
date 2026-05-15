import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/config/env';
import { createClient } from '@/shared/lib/supabase/server';
import { checkAiRateLimit } from '@/shared/lib/ratelimit';
import { RedisCircuitBreaker } from '@/shared/lib/circuit-breaker';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'Mensajes inválidos' }, { status: 400 });
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    // Rate Limiting
    const { success, remaining, reset } = await checkAiRateLimit(user.id);
    if (!success) {
      return NextResponse.json({ 
        success: false, 
        error: 'Límite excedido. Espera un momento.'
      }, { status: 429 });
    }

    // Call LLM
    const apiKey = env.bearerApiKey || env.geminiApiKey || '';
    const aiUrl = env.aiBaseUrl || 'https://api.openai.com/v1/chat/completions';

    const systemMessage = {
      role: 'system',
      content: `Eres Strategic Copilot, un asistente IA Enterprise experto en SEO Técnico, Arquitectura Web y CRO. 
Tu misión es explicar problemas SEO en lenguaje humano, priorizar tareas, generar planes de acción y sugerir fixes técnicos.
Sé conciso, directo y usa un tono profesional de agencia.
Contexto actual del usuario: ${JSON.stringify(context || 'Sin contexto específico')}`
    };

    const apiMessages = [systemMessage, ...messages];

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        message: "¡Hola! Parece que tu API Key de IA no está configurada en las variables de entorno (Bearer_API_KEY o GEMINI_API_KEY). Por favor, configúrala para activar el AI Copilot."
      });
    }

    const aiCircuitBreaker = new RedisCircuitBreaker('ai_copilot_api', {
      failureThreshold: 3,
      recoveryTimeout: 60000,
    });

    const resData = await aiCircuitBreaker.execute(async () => {
      const res = await fetch(aiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: apiMessages,
          temperature: 0.4
        })
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
           throw new Error(`Credenciales de IA inválidas o sin permisos (${res.status}). Verifica tu API Key.`);
        }
        throw new Error(`AI API error: ${res.status}`);
      }

      return res.json();
    });

    const reply = resData.choices?.[0]?.message?.content || "No pude procesar la respuesta.";

    return NextResponse.json({
      success: true,
      message: reply
    });

  } catch (error: any) {
    console.error('Error in Copilot endpoint:', error);
    return NextResponse.json({
      success: false,
      error: `Error Copilot: ${error.message || 'Servicio no disponible'}`
    }, { status: 503 });
  }
}
