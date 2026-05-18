import { NextRequest, NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations, intelligenceFindings } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { checkAiRateLimit } from "@/shared/lib/ratelimit";
import { RedisCircuitBreaker } from "@/shared/lib/circuit-breaker";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { investigationId } = await req.json();
    if (!investigationId) {
      return NextResponse.json({ success: false, error: "Falta ID de investigación" }, { status: 400 });
    }

    // Rate Limiting
    const rateLimit = await checkAiRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Límite de solicitudes de IA excedido" }, { status: 429 });
    }

    // Fetch investigation and associated findings using user-scoped context (RLS)
    const dbResult = await withRLS(user.id, async (tx) => {
      const investigationRecord = await tx.query.intelligenceInvestigations.findFirst({
        where: eq(intelligenceInvestigations.id, investigationId)
      });

      if (!investigationRecord) return null;

      const findingsRecords = await tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationId)
      });

      return { investigation: investigationRecord, findings: findingsRecords };
    });

    if (!dbResult) {
      return NextResponse.json({ success: false, error: "Investigación no encontrada o acceso denegado" }, { status: 404 });
    }

    const { investigation, findings } = dbResult;

    if (!findings || findings.length === 0) {
      return NextResponse.json({
        success: true,
        remediationPlan: "### ✅ No se encontraron vulnerabilidades\n\n¡Felicidades! La infraestructura evaluada no arrojó hallazgos de severidad media, alta o crítica. Sigue monitoreando con regularidad."
      });
    }

    // Call LLM
    const apiKey = env.openRouterApiKey || env.bearerApiKey || env.geminiApiKey || "";
    const aiUrl = env.openRouterBaseUrl ? `${env.openRouterBaseUrl}/chat/completions` : (env.aiBaseUrl || "https://api.openai.com/v1/chat/completions");
    const aiModel = env.openRouterApiKey ? "openai/gpt-3.5-turbo" : "gpt-3.5-turbo";

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        remediationPlan: "### ⚠️ Copilot Desactivado\n\nNo se detectó la clave de API de IA (`OPENROUTER_API_KEY` o `Bearer_API_KEY`) configurada en el archivo de entorno de tu servidor.\n\nPara activar el Copilot de Infraestructura y recibir un plan de remediación en tiempo real con comandos y configuraciones específicas, agrega tu clave de API."
      });
    }

    const systemMessage = {
      role: "system",
      content: `Eres Infrastructure Intelligence Copilot, un asistente de IA de nivel Enterprise experto en seguridad en la nube (AWS, Azure, GCP), arquitectura de redes, TLS/SSL, administración de DNS y seguridad de correo electrónico (SPF/DMARC/DKIM).
Tu misión es procesar una lista de hallazgos y vulnerabilidades técnicas encontradas en un host, evaluar el riesgo real en términos claros para directores de tecnología, y generar un PLAN DE REMEDIACIÓN PASO A PASO con comandos técnicos exactos (ej. OpenSSL, DNS records, configuraciones de Nginx o reglas de Cloudflare).
Responde siempre en ESPAÑOL y usa un tono profesional de consultoría de élite.`
    };

    const userMessage = {
      role: "user",
      content: `Por favor genera un plan de remediación técnica interactivo para el host "${investigation.target}" (Tipo de objetivo: ${investigation.targetType}).
La postura de seguridad calculada es: ${investigation.score}/100.

Hallazgos de seguridad encontrados:
${findings.map((f, i) => `${i + 1}. [Severidad: ${f.severity.toUpperCase()}] **${f.title}**
   - Descripción: ${f.description}
   - Recomendación inicial: ${f.recommendation}
   - Evidencia técnica: ${JSON.stringify(f.evidence)}`).join("\n\n")}`
    };

    const apiMessages = [systemMessage, userMessage];

    const aiCircuitBreaker = new RedisCircuitBreaker("ai_intelligence_copilot", {
      failureThreshold: 3,
      recoveryTimeout: 60000
    });

    const resData = await aiCircuitBreaker.execute(async () => {
      const res = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: apiMessages,
          temperature: 0.3
        })
      });

      if (!res.ok) {
        throw new Error(`AI API error: ${res.status}`);
      }

      return res.json();
    });

    const reply = resData.choices?.[0]?.message?.content || "No pude procesar el plan de remediación.";

    return NextResponse.json({
      success: true,
      remediationPlan: reply
    });

  } catch (error: any) {
    console.error("Infrastructure Copilot execution failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error al conectar con el asistente de IA: ${error.message || error}`
    }, { status: 503 });
  }
}
