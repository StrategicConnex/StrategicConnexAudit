import { NextRequest, NextResponse } from "next/server";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations, intelligenceFindings } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRateLimit } from "@/shared/lib/ratelimit";
import { callAIWithFallback, getNoApiKeyResponse, AIMessage } from "@/server/ai/ai-router";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";

// Cadena de hasta 5 modelos × 20s = 100s peor caso. Sin maxDuration, Vercel
// mata la función a los 10s (Hobby) o 60s (Pro) y el copilot se queda sin
// plan de remediación.
export const maxDuration = 120;

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
      const { investigationId } = await req.json();
      if (!investigationId) {
        return NextResponse.json({ success: false, error: "Falta ID de investigación" }, { status: 400 });
      }

      // Fetch investigation and associated findings using user-scoped context (RLS)
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

      if (!findings || findings.length === 0) {
        return NextResponse.json({
          success: true,
          remediationPlan: "### ✅ No se encontraron vulnerabilidades\n\n¡Felicidades! La infraestructura evaluada no arrojó hallazgos de severidad media, alta o crítica. Sigue monitoreando con regularidad."
        });
      }

      // Build AI messages
      const systemMsg: AIMessage = {
        role: "system",
        content: "Eres Infrastructure Intelligence Copilot, un asistente de IA de nivel Enterprise experto en seguridad en la nube (AWS, Azure, GCP), arquitectura de redes, TLS/SSL, administración de DNS y seguridad de correo electrónico (SPF/DMARC/DKIM).\nTu misión es procesar una lista de hallazgos y vulnerabilidades técnicas encontradas en un host, evaluar el riesgo real en términos claros para directores de tecnología, y generar un PLAN DE REMEDIACIÓN PASO A PASO con comandos técnicos exactos (ej. OpenSSL, DNS records, configuraciones de Nginx o reglas de Cloudflare).\nResponde siempre en ESPAÑOL y usa un tono profesional de consultoría de élite."
      };

      const userMsg: AIMessage = {
        role: "user",
        content: `Por favor genera un plan de remediación técnica interactivo para el host "${investigation.target}" (Tipo de objetivo: ${investigation.targetType}).\nLa postura de seguridad calculada es: ${investigation.score}/100.\n\nHallazgos de seguridad encontrados:\n${findings.map((f, i) => `${i + 1}. [Severidad: ${f.severity.toUpperCase()}] **${f.title}**\n   - Descripción: ${f.description}\n   - Recomendación inicial: ${f.recommendation}\n   - Evidencia técnica: ${JSON.stringify(f.evidence)}`).join("\n\n")}`
      };

      // Call AI with model pool and automatic fallback
      const aiResult = await callAIWithFallback({
        taskType: "copilot-remediation",
        messages: [systemMsg, userMsg],
        temperature: 0.3,
        maxTokens: 4096,
      });

      if (!aiResult.success) {
        return NextResponse.json({
          success: false,
          remediationPlan: getNoApiKeyResponse("copilot-remediation"),
          error: aiResult.error,
        });
      }

      return NextResponse.json({
        success: true,
        remediationPlan: aiResult.content,
        modelUsed: aiResult.modelUsed,
        fromCache: aiResult.fromCache,
      });

    } catch (error: unknown) {
      console.error("Infrastructure Copilot execution failure:", error);
      return NextResponse.json({
        success: true,
        remediationPlan: getNoApiKeyResponse("copilot-remediation"),
        error: getErrorMessage(error),
      });
    }
  }
);
