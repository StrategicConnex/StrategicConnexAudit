import { z } from "zod";
import { directDb } from "@/shared/db";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { and, eq, isNull } from "drizzle-orm";
import { callAIWithFallback, type AITaskType } from "./ai-router";
import { getNoApiKeyResponse } from "./ai-router";

/**
 * finding-triage.ts — Triage automático de findings con IA (Sprint 2, idea #1).
 *
 * Para cada finding de intelligence_findings SIN clasificación IA, el modelo
 * sugiere: severidad calibrada, CVSS, impacto en lenguaje de negocio, mapeo
 * MITRE ATT&CK, CWE y plan de remediación paso a paso. El resultado queda en
 * la columna jsonb `ai_triage` del propio finding (sin tabla nueva) junto a
 * `ai_triage_version` (hash de prompt) y `ai_triage_at` — la salida es
 * auditable junto al dato que clasifica.
 *
 * Fiabilidad:
 *  - Cadena JSON-crítica `finding-triage` (solo modelos con json_schema
 *    verificado; ver TASK_ROUTING/MODEL_CAPABILITIES en ai-router.ts).
 *  - responseFormat json_schema + validación Zod estricta del parseo.
 *  - Self-healing JSON del router (Sprint 1) actúa como segunda red.
 *  - Fire-and-forget: un fallo de triage JAMÁS rompe el pipeline del scan.
 *
 * El sweep diario re-procesa los que quedaron pendientes (rate limits,
 * timeouts, key ausente en su momento).
 */

export const FINDING_TRIAGE_PROMPT_VERSION = 2; // v2: json_object tras matriz en vivo 2026-09-20

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TriageItemSchema = z.object({
  findingId: z.string().uuid(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  cvssScore: z.number().min(0).max(10),
  mitreId: z
    .string()
    .regex(/^T\d{4}(\.\d{3})?$/, "Formato MITRE ATT&CK inválido (ej. T1190)")
    .nullable(),
  cweId: z
    .string()
    .regex(/^CWE-\d{1,4}$/, "Formato CWE inválido (ej. CWE-79)")
    .nullable(),
  businessImpact: z.string().min(10).max(1200),
  remediation: z.array(z.string().min(5).max(500)).min(1).max(8),
});

export const TriageBatchSchema = z.object({
  triage: z.array(TriageItemSchema).min(1),
});
export type TriageBatch = z.infer<typeof TriageBatchSchema>;

// ─── JSON Schema para response_format (json_schema nativo) ──────────────────

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    triage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          findingId: { type: "string" },
          severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
          cvssScore: { type: "number" },
          mitreId: { type: ["string", "null"] },
          cweId: { type: ["string", "null"] },
          businessImpact: { type: "string" },
          remediation: { type: "array", items: { type: "string" } },
        },
        required: [
          "findingId",
          "severity",
          "cvssScore",
          "mitreId",
          "cweId",
          "businessImpact",
          "remediation",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["triage"],
  additionalProperties: false,
} as const;

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildTriagePrompt(items: Array<{ id: string; title: string; description: string; severity: string; affectedAsset: string | null }>): string {
  const lista = items
    .map(
      (f, i) =>
        `${i + 1}. [id=${f.id}] Título: ${f.title}\n   Severidad detector: ${f.severity}\n   Activo: ${f.affectedAsset ?? "n/d"}\n   Descripción: ${f.description.slice(0, 500)}`
    )
    .join("\n\n");
  return (
    `Analiza los siguientes hallazgos de ciberseguridad de un mismo proyecto y devuelve el triage.\n\n` +
    `Para CADA hallazgo devuelve un objeto con:\n` +
    `- findingId: el id exacto que aparece en [id=...]\n` +
    `- severity: severidad calibrada (info|low|medium|high|critical) considerando explotabilidad real\n` +
    `- cvssScore: puntuación CVSS v3.1 base estimada (0.0-10.0)\n` +
    `- mitreId: técnica MITRE ATT&CK enterprise más pertinente (formato T#### o T####.###) o null\n` +
    `- cweId: debilidad CWE más pertinente (formato CWE-###) o null\n` +
    `- businessImpact: impacto de negocio en español, 1-3 frases, sin tecnicismos innecesarios\n` +
    `- remediation: 1-5 pasos de remediación accionables en español, en orden\n\n` +
    `Reglas: no inventes ids que no estén en la lista; si un dato no aplica usa null; ` +
    `responde EXCLUSIVAMENTE con el JSON.\n\nHALLAZGOS:\n\n${lista}`
  );
}

// ─── Servicio ────────────────────────────────────────────────────────────────

/** Máximo de findings por llamada (presupuesto de tokens y calidad de output). */
export const TRIAGE_BATCH_SIZE = 40;

export interface TriageRunResult {
  processed: number;
  failed: number;
  modelUsed: string | null;
  /** Nº de findings actualizados en BD. */
  updated: number;
  error?: string;
}

/**
 * Ejecuta el triage IA sobre hasta `limit` findings sin clasificar de un
 * proyecto. `userId` atribuye el uso en ai_usage (cuotas); null = sistema.
 */
export async function runFindingTriage(
  projectId: string,
  opts: { userId?: string | null; limit?: number } = {}
): Promise<TriageRunResult> {
  const limit = opts.limit ?? TRIAGE_BATCH_SIZE;

  // 1. Findings pendientes: sin ai_triage y sin fallo reciente (para no
  //    martillear un modelo caído dentro del mismo proceso).
  const pending = await directDb
    .select({
      id: intelligenceFindings.id,
      title: intelligenceFindings.title,
      description: intelligenceFindings.description,
      severity: intelligenceFindings.severity,
      affectedAsset: intelligenceFindings.affectedAsset,
    })
    .from(intelligenceFindings)
    .where(
      and(
        eq(intelligenceFindings.projectId, projectId),
        isNull(intelligenceFindings.aiTriage)
      )
    )
    .limit(limit);

  if (pending.length === 0) {
    return { processed: 0, failed: 0, modelUsed: null, updated: 0 };
  }

  // 2. Llamada IA (cadena JSON-crítica).
  // Matriz en vivo 2026-09-20 (producción): `json_schema` estricto con
  // require_parameters → 404 "No endpoints found" en TODOS los :free; y
  // nemotron-ultra 404 directo con json_schema. Con `json_object`:
  // nemotron-ultra devuelve JSON parseable 100%. La validación Zod estricta
  // es la barrera real de calidad (defensa en profundidad tras json_object).
  const system =
    `Eres un analista de ciberseguridad senior. Clasificas hallazgos con severidad calibrada, ` +
    `CVSS estimado, mapeo MITRE ATT&CK/CWE e impacto de negocio claro. Respondes ÚNICAMENTE con JSON ` +
    `que cumpla el schema; nunca inventas ids que no te hayan dado.`;
  const user =
    buildTriagePrompt(pending) +
    `\nFORMATO EXACTO de respuesta (JSON único, sin markdown):
{"triage":[{"findingId":"…","severity":"high","cvssScore":8.6,"mitreId":"T1190","cweId":"CWE-79","businessImpact":"…","remediation":["…"]}]}`;

  let res;
  try {
    res = await callAIWithFallback({
      taskType: "finding-triage" as AITaskType,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      maxTokens: 8000,
      responseFormat: { type: "json_object" },
      userId: opts.userId ?? null,
      cacheScope: `triage:${projectId}`,
    });
  } catch (err) {
    return {
      processed: 0,
      failed: pending.length,
      modelUsed: null,
      updated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.success) {
    // Sin key configurada el router devuelve el mensaje contextual: no es un
    // error del pipeline, es degradación graciosa documentada.
    return {
      processed: 0,
      failed: 0,
      modelUsed: res.modelUsed,
      updated: 0,
      error: res.error ?? getNoApiKeyResponse("finding-triage", "es"),
    };
  }

  // 3. Parseo + validación Zod (defensa en profundidad tras json_schema).
  let batch: TriageBatch;
  try {
    const raw: unknown = JSON.parse(res.content);
    batch = TriageBatchSchema.parse(raw);
  } catch (err) {
    return {
      processed: 0,
      failed: pending.length,
      modelUsed: res.modelUsed,
      updated: 0,
      error: `triage: salida inválida tras schema: ${
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ")
          : String(err)
      }`,
    };
  }

  // 4. Persistencia: solo ids conocidos, match exacto.
  const byId = new Map(pending.map((p) => [p.id, p]));
  const now = new Date();
  const updates = [] as Array<{ id: string; aiTriage: Record<string, unknown> }>;
  for (const item of batch.triage) {
    if (!byId.has(item.findingId)) continue; // el modelo inventó un id
    const { findingId, ...triage } = item;
    updates.push({ id: findingId, aiTriage: { ...triage, promptVersion: FINDING_TRIAGE_PROMPT_VERSION } });
  }

  let updated = 0;
  for (const u of updates) {
    const rows = await directDb
      .update(intelligenceFindings)
      .set({ aiTriage: u.aiTriage, aiTriageAt: now })
      .where(
        and(
          eq(intelligenceFindings.id, u.id),
          isNull(intelligenceFindings.aiTriage) // condición de carrera: otro proceso no lo pisa
        )
      )
      .returning({ id: intelligenceFindings.id });
    updated += rows.length;
  }

  return {
    processed: pending.length,
    failed: pending.length - updated,
    modelUsed: res.modelUsed,
    updated,
  };
}

/**
 * Sweep de un proyecto: repite el triage en batches hasta agotar pendientes
 * o alcanzar el techo de llamadas (protección de cuota). Usado por el job
 * diario y reutilizable desde la UI ("triage ahora").
 */
export async function runFindingTriageSweep(
  projectId: string,
  opts: { userId?: string | null; maxCalls?: number; batchSize?: number } = {}
): Promise<TriageRunResult & { calls: number }> {
  const maxCalls = opts.maxCalls ?? 4;
  const batchSize = opts.batchSize ?? TRIAGE_BATCH_SIZE;
  let calls = 0;
  let updated = 0;
  let failed = 0;
  let modelUsed: string | null = null;
  let lastError: string | undefined;

  while (calls < maxCalls) {
    const r = await runFindingTriage(projectId, { userId: opts.userId, limit: batchSize });
    calls++;
    updated += r.updated;
    failed += r.failed;
    if (r.modelUsed) modelUsed = r.modelUsed;
    if (r.error) lastError = r.error;
    // Sin pendientes o sin progreso real → parar.
    if (r.processed === 0 || r.updated === 0) break;
  }

  return { processed: updated, failed, modelUsed, updated, calls, error: lastError };
}
