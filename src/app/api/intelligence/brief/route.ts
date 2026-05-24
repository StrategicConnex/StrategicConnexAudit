import { NextRequest, NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations, intelligenceFindings } from "@/shared/db/schemas";
import { eq, inArray } from "drizzle-orm";
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

    // Rate limiting
    const rateLimit = await checkAiRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Límite de solicitudes de IA excedido" }, { status: 429 });
    }

    // Fetch investigation + findings via RLS
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

    // Filter to high + critical findings only
    const highPriorityFindings = findings.filter(f =>
      f.severity === "critical" || f.severity === "high"
    );

    if (highPriorityFindings.length === 0) {
      return NextResponse.json({
        success: true,
        brief: `## Resumen Ejecutivo\n\nNo se detectaron hallazgos de severidad alta o crítica en el objetivo **${investigation.target}**. La postura de seguridad actual (${investigation.score}/100) no requiere generación de un Incident Brief de emergencia.\n\n## Recomendación\n\nContinuar con el monitoreo periódico y revisar hallazgos de severidad media para mejora continua.`
      });
    }

    // Build AI call
    const apiKey = env.openRouterApiKey || env.bearerApiKey || env.geminiApiKey || "";
    const aiUrl = env.openRouterBaseUrl
      ? `${env.openRouterBaseUrl}/chat/completions`
      : (env.aiBaseUrl || "https://api.openai.com/v1/chat/completions");
    const aiModel = env.openRouterApiKey ? "openai/gpt-4o-mini" : "gpt-4o-mini";

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        brief: `## ⚠️ Motor de IA No Configurado\n\nPara generar un Incident Brief automático, configura la variable de entorno \`OPENROUTER_API_KEY\` con tu clave de OpenRouter.\n\n## Hallazgos de Alta Severidad Detectados (${highPriorityFindings.length})\n\n${highPriorityFindings.map((f, i) => `### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n\n${f.description}\n\n**Acción recomendada:** ${f.recommendation || "Revisar con el equipo de seguridad."}`).join("\n\n---\n\n")}`
      });
    }

    const today = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
    const systemPrompt = `Eres un Analista Senior de Ciberseguridad especializado en generar Incident Briefs ejecutivos para equipos de dirección y C-suite.
Tu objetivo es transformar hallazgos técnicos de seguridad en un documento ejecutivo claro, accionable y urgente.
Responde siempre en ESPAÑOL con un tono profesional, directo y sin ambigüedades técnicas innecesarias.
Usa formato Markdown con secciones bien definidas.`;

    const userPrompt = `Genera un Incident Brief ejecutivo para el objetivo "${investigation.target}" con fecha ${today}.

Score de Postura de Seguridad: ${investigation.score ?? "N/A"}/100
Tipo de objetivo: ${investigation.targetType}
Total hallazgos críticos: ${findings.filter(f => f.severity === "critical").length}
Total hallazgos altos: ${findings.filter(f => f.severity === "high").length}
Total hallazgos medios: ${findings.filter(f => f.severity === "medium").length}

Hallazgos de Alta Severidad (${highPriorityFindings.length}):
${highPriorityFindings.map((f, i) =>
  `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}
   Descripción: ${f.description}
   Activo afectado: ${f.affectedAsset || "Infraestructura principal"}
   Recomendación: ${f.recommendation || "Revisar con equipo técnico"}`
).join("\n\n")}

El Incident Brief debe incluir las siguientes secciones en este orden exacto:
## Resumen Ejecutivo
(2 párrafos. Gravedad del incidente, superficie expuesta y urgencia de acción sin tecnicismos)

## Timeline del Incidente
(Fecha de detección, ventana de exposición estimada, próximos hitos críticos)

## Activos Afectados
(Lista de assets comprometidos o en riesgo con su nivel de exposición)

## Vector de Ataque Principal
(Cómo podría un atacante explotar las vulnerabilidades encontradas, en términos de negocio)

## Acciones Inmediatas (Primeras 48h)
(Lista numerada de 4-6 acciones concretas y ejecutables, ordenadas por prioridad)

## Impacto Estimado en Negocio
(Riesgos regulatorios GDPR/PCI, reputacionales, operacionales y financieros en caso de explotación)`;

    const aiCircuitBreaker = new RedisCircuitBreaker("ai_incident_brief", {
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
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1800
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI API error ${res.status}: ${errText.substring(0, 200)}`);
      }

      return res.json();
    });

    const brief = resData.choices?.[0]?.message?.content || "No fue posible generar el Incident Brief. Intenta nuevamente.";

    return NextResponse.json({ success: true, brief });

  } catch (error: any) {
    console.error("Incident Brief generation failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error al generar el brief: ${error.message || error}`
    }, { status: 503 });
  }
}
