import { NextRequest, NextResponse } from "next/server";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations, intelligenceFindings } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRateLimit } from "@/shared/lib/ratelimit";
import { callAIWithFallback, getNoApiKeyResponse, AIMessage } from "@/server/ai/ai-router";

export const dynamic = "force-dynamic";

export const POST = withRateLimit(
  {
    limit: 10,
    window: 60,
    prefix: "intel_brief",
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    }
  },
  async (req: NextRequest, _userId: string) => {
    try {
      const { investigationId } = await req.json();
      if (!investigationId) {
        return NextResponse.json({ success: false, error: "Falta ID de investigación" }, { status: 400 });
      }

      // Fetch investigation + findings via RLS
      const dbResult = await withRLS(_userId, async (tx) => {
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

      // Build AI messages for Incident Brief
      const today = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });

      const systemMsg: AIMessage = {
        role: "system",
        content: "Eres un Analista Senior de Ciberseguridad especializado en generar Incident Briefs ejecutivos para equipos de dirección y C-suite.\nTu objetivo es transformar hallazgos técnicos de seguridad en un documento ejecutivo claro, accionable y urgente.\nResponde siempre en ESPAÑOL con un tono profesional, directo y sin ambigüedades técnicas innecesarias.\nUsa formato Markdown con secciones bien definidas."
      };

      const userMsg: AIMessage = {
        role: "user",
        content: `Genera un Incident Brief ejecutivo para el objetivo "${investigation.target}" con fecha ${today}.\n\nScore de Postura de Seguridad: ${investigation.score ?? "N/A"}/100\nTipo de objetivo: ${investigation.targetType}\nTotal hallazgos críticos: ${findings.filter(f => f.severity === "critical").length}\nTotal hallazgos altos: ${findings.filter(f => f.severity === "high").length}\nTotal hallazgos medios: ${findings.filter(f => f.severity === "medium").length}\n\nHallazgos de Alta Severidad (${highPriorityFindings.length}):\n${highPriorityFindings.map((f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Descripción: ${f.description}\n   Activo afectado: ${f.affectedAsset || "Infraestructura principal"}\n   Recomendación: ${f.recommendation || "Revisar con equipo técnico"}`
      ).join("\n\n")}\n\nEl Incident Brief debe incluir las siguientes secciones en este orden exacto:\n## Resumen Ejecutivo\n## Timeline del Incidente\n## Activos Afectados\n## Vector de Ataque Principal\n## Acciones Inmediatas (Primeras 48h)\n## Impacto Estimado en Negocio`
      };

      // Call AI with free model pool
      const aiResult = await callAIWithFallback({
        taskType: "incident-brief",
        messages: [systemMsg, userMsg],
        temperature: 0.2,
        maxTokens: 1800,
      });

      if (!aiResult.success && aiResult.error?.includes("OPENROUTER_API_KEY is not configured")) {
        // No API key — return findings in a structured brief without AI
        return NextResponse.json({
          success: true,
          brief: `## ⚠️ Motor de IA No Configurado\n\n${getNoApiKeyResponse("incident-brief")}\n\n## Hallazgos de Alta Severidad Detectados (${highPriorityFindings.length})\n\n${highPriorityFindings.map((f, i) => `### ${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n\n${f.description}\n\n**Acción recomendada:** ${f.recommendation || "Revisar con el equipo de seguridad."}`).join("\n\n---\n\n")}`
        });
      }

      const brief = aiResult.success ? aiResult.content : "No fue posible generar el Incident Brief. Intenta nuevamente.";

      return NextResponse.json({
        success: true,
        brief,
        modelUsed: aiResult.modelUsed,
        fromCache: aiResult.fromCache,
      });

    } catch (error: any) {
      console.error("Incident Brief generation failure:", error);
      return NextResponse.json({
        success: true,
        brief: getNoApiKeyResponse("incident-brief"),
        error: error.message || "Error desconocido",
      });
    }
  }
);
