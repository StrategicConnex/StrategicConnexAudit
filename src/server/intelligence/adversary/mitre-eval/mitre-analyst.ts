/**
 * mitre-analyst.ts — Agente AI de Cobertura MITRE Real.
 *
 * Tres etapas sobre la cadena pinneada (sin router aleatorio):
 *   1. Veredicto por técnica testeable: evidencia → {verdict, summary, remediation}
 *   2. Playbook por técnica no-testeable: validación exacta en SU stack
 *      (SIEM/EDR/GPO) adaptada al fingerprinting detectado
 *   3. Síntesis ejecutiva de cobertura real + riskScore + topActions
 */

import { z } from "zod";
import { callAIWithFallback } from "@/server/ai/ai-router";
import type { MitreBatchEvidence, MitreVerdict } from "./mitre-runner";

export const techniqueResultSchema = z.object({
  verdict: z.enum(["exposed", "not_exposed", "not_externally_testable", "error"]),
  confidence: z.number().min(0).max(1).default(0.8),
  summary: z.string().min(10).max(1200),
  remediation: z.array(z.string()).max(12).default([]),
});

export const playbookSchema = z.object({
  verdict: z.literal("not_externally_testable"),
  summary: z.string().min(10).max(800),
  playbook: z.array(z.string()).min(1).max(15),
});

export const coverageSummarySchema = z.object({
  summary: z.string().min(50),
  riskScore: z.number().int().min(0).max(100),
  topActions: z.array(z.string()).min(1).max(5),
});

export type TechniqueAIResult = z.infer<typeof techniqueResultSchema>;
export type PlaybookAIResult = z.infer<typeof playbookSchema>;
export type CoverageSummary = z.infer<typeof coverageSummarySchema>;

const VERDICT_SYSTEM = `Eres un analista MITRE ATT&CK senior. Recibes evidencia REAL (checks automatizados
no destructivos) de una técnica contra un sitio autorizado.

Decide el veredicto:
- "exposed": la evidencia confirma que la técnica es viable contra el objetivo.
- "not_exposed": los checks pasaron; sin exposición evidente.
- "error": la evidencia es insuficiente o falló.
NO inventes hallazgos sin respaldo. La remediation debe ser específica para las tecnologías detectadas.

Responde EXCLUSIVAMENTE JSON válido: {"verdict":"...","confidence":0-1,"summary":"...","remediation":["..."]}`;

const PLAYBOOK_SYSTEM = `Eres un ingeniero de detección (purple team). Una técnica MITRE NO puede probarse
desde internet (requiere acceso interno/host): LSASS, LLMNR, password spray, PowerShell bypass, eliminación de backups.

Con el contexto del objetivo (stack tecnológico si se conoce), genera un playbook de VALIDACIÓN MANUAL exacto:
pasos concretos con comandos reales (KQL/Splunk SPL/Event IDs/GPO/PowerShell defensivo) que el equipo del cliente
puede ejecutar para comprobar si SU stack detectaría la técnica. Un paso por elemento del array; comandos completos,
sin placeholders vagos. Responde EXCLUSIVAMENTE JSON válido:
{"verdict":"not_externally_testable","summary":"...","playbook":["paso 1","paso 2",...]}`;

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("sin objeto JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callJson<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens: number
): Promise<{ data: T; modelUsed: string }> {
  for (const attempt of [0, 1]) {
    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages: [
        {
          role: "system",
          content: attempt === 0 ? system : `${system}\n\nRECORDATORIO: SOLO JSON válido, empieza por { y termina por }.`,
        },
        { role: "user", content: user },
      ],
      temperature: attempt === 0 ? 0.2 : 0,
      maxTokens,
    });
    if (!res.success) continue;
    try {
      const parsed = schema.safeParse(extractJson(res.content));
      if (parsed.success) return { data: parsed.data, modelUsed: res.modelUsed };
      if (attempt === 1) throw new Error("schema inválido tras reintento");
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("Ningún modelo produjo JSON válido");
}

// ─── Etapa 1: veredicto por técnica testable ────────────────────────────────

export async function analyzeTestableTechnique(
  technique: MitreBatchEvidence["techniques"][number],
  target: string
): Promise<TechniqueAIResult & { modelUsed: string }> {
  const compact = {
    target,
    mitreId: technique.mitreId,
    technique: technique.techniqueName,
    checks: technique.checkResults.map((c) => ({
      id: c.id,
      status: c.status,
      severity: c.severity ?? null,
      summary: c.summary,
      evidence: c.evidence,
    })),
    portProbes: technique.portProbes ?? null,
  };

  const { data, modelUsed } = await callJson(
    VERDICT_SYSTEM,
    `Técnica: ${technique.mitreId} (${technique.techniqueName})\n\nEVIDENCIA:\n${JSON.stringify(compact).slice(0, 40_000)}`,
    techniqueResultSchema,
    2500
  );
  return { ...data, modelUsed };
}

// ─── Etapa 2: playbook por técnica manual ──────────────────────────────────

export async function generatePlaybook(
  mitreId: string,
  techniqueName: string,
  detectedStack: string[],
  target: string
): Promise<PlaybookAIResult & { modelUsed: string }> {
  const { data, modelUsed } = await callJson(
    PLAYBOOK_SYSTEM,
    [
      `Objetivo: ${target}`,
      `Técnica: ${mitreId} — ${techniqueName}`,
      detectedStack.length > 0 ? `Stack detectado en el perímetro: ${detectedStack.join(", ")}` : "Stack interno desconocido.",
    ].join("\n"),
    playbookSchema,
    2500
  );
  return { ...data, modelUsed };
}

// ─── Etapa 3: síntesis ejecutiva ────────────────────────────────────────────

export async function synthesizeCoverageSummary(
  results: Array<{ mitreId: string; techniqueName: string; verdict: MitreVerdict }>,
  target: string
): Promise<CoverageSummary> {
  const digest = results
    .map((r) => `- ${r.mitreId} ${r.techniqueName}: ${r.verdict.toUpperCase()}`)
    .join("\n");

  const { data } = await callJson(
    `Eres un consultor de seguridad que resume una evaluación real de cobertura MITRE ATT&CK para dirección técnica.
Responde EXCLUSIVAMENTE JSON válido: {"summary":"<150-400 caracteres, español profesional>","riskScore":<0-100>,"topActions":["...", "máx 5"]}`,
    `Sitio: ${target}\nResultados por técnica:\n${digest}`,
    coverageSummarySchema,
    1200
  );
  return data;
}
