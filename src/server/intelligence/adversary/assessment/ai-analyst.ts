/**
 * ai-analyst.ts — Agente Analista de Vulnerabilidades (OpenRouter).
 *
 * Convierte la evidencia cruda del assessment real en un informe completo:
 * vulnerabilidades clasificadas (CVSS/CWE/OWASP) con remediación paso a paso
 * y resumen ejecutivo. Corre sobre cadenas SIN router aleatorio (ver
 * TASK_ROUTING["adversary-analysis"]) con modelos verificados en vivo para
 * function calling y/o structured outputs.
 *
 * Estrategia de salida:
 *   A) json_schema nativo (require_parameters) + bucle agéntico con tools
 *      para que el modelo profundice en evidencia cuando lo necesite.
 *   B) Fallback: sin response_format, JSON por prompt + parsing tolerante.
 *
 * Si ambas fallan devolvemos analysisFailed=true y la UI muestra la
 * evidencia cruda.
 */

import { z } from "zod";
import { callAIAgentLoop, type OpenRouterToolDef } from "@/server/ai/ai-router";
import { registerTools } from "@/server/ai/tools/registry";
import { buildAdversaryTools } from "@/server/ai/tools/adversary-tools";
import { executiveSummarySchema, type ExecutiveSummary } from "./summary-schema";
import type { AssessmentEvidence } from "./types";

// ─── Schemas de salida del agente ───────────────────────────────────────────

export const vulnerabilitySchema = z.object({
  title: z.string().min(3).max(200),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  cvssScore: z.number().min(0).max(10),
  cweId: z.string().regex(/^CWE-\d+$/).nullable().optional(),
  owaspCategory: z.string().max(80).nullable().optional(),
  mitreId: z.string().max(20).nullable().optional(),
  description: z.string().min(10),
  evidenceSummary: z.string(),
  remediation: z.array(z.string()).min(1).max(12),
  references: z.array(z.string()).max(6).default([]),
  confidence: z.number().min(0).max(1).default(0.8),
});

const triageResponseSchema = z.object({
  vulnerabilities: z.array(vulnerabilitySchema).max(30),
});
type TriageResponse = z.infer<typeof triageResponseSchema>;

export type AnalyzedVulnerability = z.infer<typeof vulnerabilitySchema>;

export interface AnalysisResult {
  success: boolean;
  vulnerabilities: AnalyzedVulnerability[];
  executive?: ExecutiveSummary;
  modelUsed?: string;
  analysisFailed?: boolean;
  /** Trazabilidad de las funciones que el modelo decidió invocar. */
  toolInvocations?: Array<{ name: string; ok: boolean }>;
  error?: string;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const TRIAGE_SYSTEM = `Eres un analista senior de seguridad ofensiva (OSCP/OSWE) que revisa la evidencia
de una evaluación NO destructiva automatizada contra un sitio autorizado.

Tu trabajo: a partir SOLO de la evidencia proporcionada, producir el JSON final con las
vulnerabilidades REALES confirmadas por la evidencia. Reglas:

1. NUNCA inventes hallazgos sin evidencia que los respalde. Si la evidencia es ambigua,
   baja la confianza o omite el hallazgo.
2. Cada vulnerabilidad incluye: title, severity (info|low|medium|high|critical), cvssScore
   (0-10, vector implícito en descripción), cweId (formato CWE-NUM u null), owaspCategory
   (ej: "A03:2021 Injection"), mitreId (si aplica), description (qué es y por qué importa),
   evidenceSummary (cita los datos duros de la evidencia), remediation (pasos numerados
   accionables, específicos para la tecnología detectada), references (URLs: OWASP, CWE,
   documentación oficial).
3. Puedes usar las funciones disponibles (get_assessment_evidence,
   get_assessment_summary, list_project_findings) para examinar la evidencia en detalle
   ANTES de responder. Cuando tengas todo, responde EXCLUSIVAMENTE con el JSON final.`;

const SUMMARY_SYSTEM = `Eres un consultor de seguridad que redacta el resumen ejecutivo de un informe
de evaluación de seguridad para la dirección técnica del sitio auditado.

Responde EXCLUSIVAMENTE con JSON válido:
{"summary":"<resumen ejecutivo en español, 150-400 caracteres, tono profesional>",
 "riskScore":<0-100 donde 100=riesgo crítico inmediato>,
 "topActions":["acción priorizada 1","...","máximo 5"]}`;

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("sin objeto JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Etapa 1: triage de evidencia (agéntico) ───────────────────────────────

async function runTriageAttempt(
  userPrompt: string,
  userId: string,
  assessmentId: string | undefined,
  projectId: string | undefined,
  withSchema: boolean
): Promise<{
  vulnerabilities: AnalyzedVulnerability[];
  modelUsed: string;
  toolInvocations: NonNullable<AnalysisResult["toolInvocations"]>;
}> {
  // Tools solo si hay contexto real al que scopearlas
  const canUseTools = !!assessmentId && !!projectId;
  let toolDefs: OpenRouterToolDef[] | undefined;
  let handlers: Map<string, (args: unknown) => Promise<unknown>> | undefined;
  if (canUseTools) {
    const registered = registerTools(buildAdversaryTools(userId));
    toolDefs = registered.toolDefs;
    handlers = registered.handlers;
  }

  const res = await callAIAgentLoop({
    taskType: "adversary-analysis",
    messages: [
      {
        role: "system",
        content: withSchema
          ? TRIAGE_SYSTEM
          : `${TRIAGE_SYSTEM}\n\nIMPORTANTE: responde ÚNICAMENTE con JSON válido, empezando por { y terminando por }. Sin markdown ni texto adicional.`,
      },
      { role: "user", content: userPrompt },
    ],
    temperature: withSchema ? 0.2 : 0,
    maxTokens: 6000,
    ...(toolDefs ? { tools: toolDefs } : {}),
    ...(withSchema
      ? {
          responseFormat: {
            type: "json_schema" as const,
            name: "adversary_triage",
            schema: {
              type: "object",
              properties: {
                vulnerabilities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
                      cvssScore: { type: "number" },
                      cweId: { type: ["string", "null"] },
                      owaspCategory: { type: ["string", "null"] },
                      mitreId: { type: ["string", "null"] },
                      description: { type: "string" },
                      evidenceSummary: { type: "string" },
                      remediation: { type: "array", items: { type: "string" } },
                      references: { type: "array", items: { type: "string" } },
                      confidence: { type: "number" },
                    },
                    required: ["title", "severity", "cvssScore", "description", "evidenceSummary", "remediation"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["vulnerabilities"],
              additionalProperties: false,
            },
          },
        }
      : {}),
    ...(handlers ? { toolHandlers: handlers } : { toolHandlers: new Map() }),
    maxIterations: 5,
  });

  if (!res.success) throw new Error(res.error ?? "agentic loop falló");

  const parsed = triageResponseSchema.safeParse(extractJson(res.content));
  if (!parsed.success) {
    throw new Error(
      "schema triage: " +
        parsed.error.issues.map((i) => i.path.join(".")).slice(0, 5).join(", ")
    );
  }
  return {
    vulnerabilities: parsed.data.vulnerabilities,
    modelUsed: res.modelUsed ?? "desconocido",
    toolInvocations: res.toolInvocations,
  };
}

export async function triageEvidence(
  evidence: AssessmentEvidence,
  projectName: string,
  ctx: { userId: string; assessmentId?: string; projectId?: string }
): Promise<{ vulnerabilities: AnalyzedVulnerability[]; modelUsed: string; toolInvocations: AnalysisResult["toolInvocations"] }> {
  // Comprimimos la evidencia: solo checks ejecutados y sus datos relevantes,
  // recortando bodies largos para caber en el contexto de modelos :free.
  const compact = {
    target: evidence.target,
    project: projectName,
    checks: evidence.checks
      .filter((c) => c.status !== "error")
      .map((c) => ({
        id: c.id,
        status: c.status,
        severity: c.severity ?? null,
        summary: c.summary,
        evidence: c.evidence,
      })),
    errors: evidence.checks.filter((c) => c.status === "error").map((c) => ({ id: c.id, summary: c.summary })),
  };

  const userPrompt = [
    `Sitio evaluado: ${evidence.target} (proyecto: ${projectName}).`,
    `Metodología: ${compact.checks.length} checks automatizados no destructivos.`,
    "",
    "EVIDENCIA JSON:",
    JSON.stringify(compact).slice(0, 60_000),
  ].join("\n");

  // A) json_schema nativo (solo modelos verificados en la cadena lo soportan;
  //    los que no, fallan rápido por require_parameters y caen al siguiente).
  try {
    return await runTriageAttempt(userPrompt, ctx.userId, ctx.assessmentId, ctx.projectId, true);
  } catch {
    // B) Prompt-based JSON (modelos sin structured outputs)
    return await runTriageAttempt(userPrompt, ctx.userId, ctx.assessmentId, ctx.projectId, false);
  }
}

// ─── Etapa 2: síntesis ejecutiva ────────────────────────────────────────────

export async function synthesizeSummary(
  vulnerabilities: AnalyzedVulnerability[],
  target: string
): Promise<ExecutiveSummary> {
  const digest = vulnerabilities
    .map((v) => `- [${v.severity.toUpperCase()}] ${v.title} (CVSS ${v.cvssScore})`)
    .join("\n");

  const { callAIWithFallback } = await import("@/server/ai/ai-router");
  const messages = [
    { role: "system" as const, content: SUMMARY_SYSTEM },
    {
      role: "user" as const,
      content: `Sitio: ${target}\nVulnerabilidades confirmadas:\n${digest || "(ninguna)"}`,
    },
  ];

  for (const temperature of [0.2, 0]) {
    const res = await callAIWithFallback({ taskType: "adversary-analysis", messages, maxTokens: 1200, temperature });
    if (!res.success) continue;
    try {
      const parsed = executiveSummarySchema.safeParse(extractJson(res.content));
      if (parsed.success) return parsed.data;
    } catch {
      /* siguiente intento */
    }
  }
  throw new Error("El agente AI no produjo un resumen ejecutivo válido");
}

// ─── Pipeline completo ──────────────────────────────────────────────────────

export async function analyzeAssessment(
  evidence: AssessmentEvidence,
  projectName: string,
  ctx: { userId: string; assessmentId?: string; projectId?: string }
): Promise<AnalysisResult> {
  try {
    const { vulnerabilities, modelUsed, toolInvocations } = await triageEvidence(evidence, projectName, ctx);
    let executive: ExecutiveSummary | undefined;
    try {
      executive = await synthesizeSummary(vulnerabilities, evidence.target);
    } catch {
      // El resumen es prescindible si hay vulnerabilidades; no falla el análisis
      executive = undefined;
    }
    return { success: true, vulnerabilities, executive, modelUsed, toolInvocations };
  } catch (err) {
    return {
      success: false,
      vulnerabilities: [],
      analysisFailed: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
