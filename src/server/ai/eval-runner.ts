import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { aiEvalResults } from "@/shared/db/schemas/ai-evals";
import {
  callAIWithFallback,
  MODEL_CAPABILITIES,
  TASK_ROUTING,
  type AIMessage,
} from "./ai-router";
import { promptVersion } from "./prompt-version";
import {
  scoreTriageOutput,
  type GoldenCase,
  type TriageScore,
} from "./eval/triage-scorer";
import { TRIAGE_SYSTEM } from "@/server/intelligence/adversary/assessment/ai-analyst";

/**
 * eval-runner.ts — Eval continuo y reproducible del pool (Sprint 4, idea #8).
 *
 * Corre el golden dataset del triage contra MODELOS CONCRETOS del pool
 * (modelOverride: sin cadena, sin cache) y puntúa con el scorer determinista
 * de eval/triage-scorer.ts. Cada llamada registra su hash de prompt_version
 * (idea #18) en ai_usage y en cada fila de ai_eval_results, de modo que:
 *
 *   - comparar modelos entre sí  → mismo prompt_version, distinto modelo
 *   - comparar prompts entre sí  → mismo modelo, distinto prompt_version
 *
 * Cambiar el prompt de producción cambia el hash automáticamente: las
 * métricas nuevas empiezan una serie nueva y nunca se mezclan series.
 */

// ─── Dataset y pool ─────────────────────────────────────────────────────────

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadGolden(): GoldenCase[] {
  const candidates = [
    join(root, "src/server/ai/eval/adversary-golden.json"),
    join(process.cwd(), "src/server/ai/eval/adversary-golden.json"),
  ];
  for (const p of candidates) {
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { cases: GoldenCase[] }).cases;
    } catch {
      // siguiente candidata
    }
  }
  return [];
}

const GOLDEN: GoldenCase[] = loadGolden();

/** Casos dorados (acotables): el dataset vive aquí para runner, script y harness. */
export function getGoldenCases(limit?: number): GoldenCase[] {
  return limit && limit > 0 ? GOLDEN.slice(0, limit) : GOLDEN;
}

/** Modelos a evaluar: los verificados de MODEL_CAPABILITIES (hoy, 5). */
export const EVAL_MODELS: string[] = Object.keys(MODEL_CAPABILITIES);

/** Umbral de aprobación de un caso (mismo criterio que el runner P2-2). */
export const EVAL_PASS_THRESHOLD = 80;

/** Variante B del system prompt (prompt-based JSON): la que todos pueden cumplir. */
const EVAL_SYSTEM = `${TRIAGE_SYSTEM}

IMPORTANTE: responde ÚNICAMENTE con JSON válido, empezando por { y terminando por }. Sin markdown ni texto adicional.`;

/** User prompt en el formato EXACTO de triageEvidence() (compact + slice 60k). */
function buildTriageEvalPrompt(golden: GoldenCase, projectName: string): string {
  const checks = Array.isArray(golden.evidence.checks) ? golden.evidence.checks : [];
  const compact = {
    target: golden.evidence.target,
    project: projectName,
    checks,
    errors: [],
  };
  return [
    `Sitio evaluado: ${String(golden.evidence.target)} (proyecto: ${projectName}).`,
    `Metodología: ${checks.length} checks automatizados no destructivos.`,
    "",
    "EVIDENCIA JSON:",
    JSON.stringify(compact).slice(0, 60_000),
  ].join("\n");
}

// ─── Ejecución de un caso contra un modelo ──────────────────────────────────

export interface CaseEvalOutcome {
  caseId: string;
  model: string;
  promptVersion: string;
  score: number;
  passed: boolean;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  errored: boolean;
  /** Mensaje de error o checks fallidos. */
  detail?: string;
  /** Score por check (para debug del output del modelo). */
  checks?: TriageScore["checks"];
}

export interface EvalRunSummary {
  results: CaseEvalOutcome[];
  okCalls: number;
  avgScore: number;
}

const EVAL_PROJECT = "eval-golden";

/**
 * Ejecuta el golden dataset contra UN modelo concreto y persiste cada fila.
 * `cases` permite acotar (rotación semanal); sin él, todos.
 */
export async function runModelEval(
  model: string,
  opts: { cases?: GoldenCase[]; userId?: string | null } = {}
): Promise<EvalRunSummary> {
  const cases = opts.cases ?? GOLDEN;
  const results: CaseEvalOutcome[] = [];
  for (const c of cases) {
    const messages: AIMessage[] = [
      { role: "system", content: EVAL_SYSTEM },
      { role: "user", content: buildTriageEvalPrompt(c, EVAL_PROJECT) },
    ];
    const out = await evalSingleCall(model, c, messages, opts.userId ?? null);
    results.push(out);
    // Persistencia fila a fila: una ronda cortada a medias deja datos útiles.
    await saveEvalRow(out);
  }
  const ok = results.filter((r) => !r.errored);
  return {
    results,
    okCalls: ok.length,
    avgScore: ok.length ? Math.round(ok.reduce((a, r) => a + r.score, 0) / ok.length) : 0,
  };
}

/** Una llamada real + scoring + fila lista para BD. */
async function evalSingleCall(
  model: string,
  golden: GoldenCase,
  messages: AIMessage[],
  userId: string | null
): Promise<CaseEvalOutcome> {
  const pv = promptVersion(messages);
  const t0 = Date.now();
  let content: string | null = null;
  let modelUsed: string = model;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let errored = true;
  let detail: string | undefined;

  try {
    const res = await callAIWithFallback({
      taskType: "adversary-analysis",
      messages,
      temperature: 0,
      maxTokens: 6000,
      responseFormat: { type: "json_object" },
      modelOverride: model,
      userId,
      // cacheScope N/A: con modelOverride el cache está bypaseado.
    });
    modelUsed = res.modelUsed || model;
    if (res.success && res.content) {
      content = res.content;
      tokensIn = res.usage?.tokensIn ?? null;
      tokensOut = res.usage?.tokensOut ?? null;
    } else {
      detail = res.error ?? "sin contenido";
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  let score = 0;
  let checks: TriageScore["checks"] | undefined;
  if (content !== null) {
    try {
      const parsed = JSON.parse(stripFences(content)) as {
        vulnerabilities?: unknown;
      };
      const s = scoreTriageOutput(golden, parsed);
      score = s.score;
      checks = s.checks;
      errored = false;
      const failed = s.checks.filter((x) => !x.pass).map((x) => x.name);
      if (failed.length > 0) detail = `checks fallidos: ${failed.join("; ")}`;
    } catch (err) {
      errored = true;
      score = 0;
      detail = `salida no-JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    caseId: golden.id,
    model: modelUsed,
    promptVersion: pv,
    score,
    passed: score >= EVAL_PASS_THRESHOLD,
    latencyMs: Date.now() - t0,
    tokensIn,
    tokensOut,
    costUsd: null,
    errored,
    detail,
    checks,
  };
}

/** Extrae el primer objeto JSON balanceado (tolera fences markdown). */
function stripFences(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

// ─── Persistencia y consultas ───────────────────────────────────────────────

async function saveEvalRow(out: CaseEvalOutcome): Promise<void> {
  await directDb.insert(aiEvalResults).values({
    taskType: "adversary-analysis",
    caseId: out.caseId,
    model: out.model,
    promptVersion: out.promptVersion,
    score: out.score,
    passed: out.passed,
    latencyMs: out.latencyMs,
    tokensIn: out.tokensIn,
    tokensOut: out.tokensOut,
    costUsd: out.costUsd,
    errored: out.errored,
    detail: { note: out.detail ?? null, checks: out.checks ?? null },
    userId: null,
  });
}

export interface ModelVersionReport {
  model: string;
  promptVersion: string;
  runs: number;
  avgScore: number;
  passRate: number;
  errorRate: number;
  avgLatencyMs: number;
  lastRun: Date | null;
}

/**
 * Métricas agregadas por (modelo, prompt_version). Es la vista que consumen
 * la propuesta de cadenas y la comparación entre versiones de prompt.
 */
export async function evalReportSince(days: number = 30): Promise<ModelVersionReport[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await directDb
    .select({
      model: aiEvalResults.model,
      promptVersion: aiEvalResults.promptVersion,
      runs: sql<number>`count(*)::int`,
      avgScore: sql<number>`round(avg(${aiEvalResults.score}))::int`,
      passRate: sql<number>`round(100.0 * avg((${aiEvalResults.passed})::int))::int`,
      errorRate: sql<number>`round(100.0 * avg((${aiEvalResults.errored})::int))::int`,
      avgLatencyMs: sql<number>`round(avg(${aiEvalResults.latencyMs}))::int`,
      lastRun: sql<Date>`max(${aiEvalResults.createdAt})`,
    })
    .from(aiEvalResults)
    .where(and(eq(aiEvalResults.taskType, "adversary-analysis"), gte(aiEvalResults.createdAt, since)))
    .groupBy(aiEvalResults.model, aiEvalResults.promptVersion)
    .orderBy(desc(sql`max(${aiEvalResults.createdAt})`));
  return rows;
}

// ─── Propuesta de cadenas (guardrail incluido) ──────────────────────────────

export interface ChainProposal {
  taskType: "adversary-analysis";
  /** Cadena actual (TASK_ROUTING) para comparación. */
  current: string[];
  /** Cadena reordenada: nunca elimina modelos (resiliencia intacta). */
  proposed: string[];
  reasons: string[];
}

/**
 * Propone REORDENAR la cadena JSON-crítica de adversary-analysis según los
 * evals recientes: los modelos con buen score/errores suben, los que rinden
 * bajo el umbral bajan al final (siguen siendo fallback válido).
 * GUARDRAILS: nunca elimina modelos y nunca propone una cadena con < 2.
 */
export async function proposeAdversaryChain(
  opts: { minRuns?: number; days?: number } = {}
): Promise<ChainProposal> {
  const current = TASK_ROUTING["adversary-analysis"];
  const minRuns = opts.minRuns ?? 10;
  const reports = (await evalReportSince(opts.days ?? 30)).filter((r) => r.runs >= minRuns);

  const eligible = reports
    .filter((r) => r.errorRate <= 20 && r.avgScore >= EVAL_PASS_THRESHOLD)
    .sort((a, b) => b.avgScore - a.avgScore || a.avgLatencyMs - b.avgLatencyMs);

  const currentSet = new Set(current);
  const keep = eligible.map((e) => e.model).filter((m) => currentSet.has(m));
  const demoted = current.filter((m) => {
    const r = reports.find((x) => x.model === m);
    // Sin datos suficientes: conservar posición (no castigar la falta de eval).
    return r ? r.errorRate > 20 || r.avgScore < EVAL_PASS_THRESHOLD : false;
  });
  const rest = current.filter((m) => !keep.includes(m) && !demoted.includes(m));
  const proposed = [...keep, ...rest, ...demoted];

  const reasons = [
    ...eligible
      .slice(0, 3)
      .map((e) => `${e.model}: score ${e.avgScore}, errores ${e.errorRate}% (${e.runs} runs) — cabe antes en la cadena`),
    ...demoted.map((m) => `${m}: al final (score/errores bajo umbral en evals recientes)`),
  ];

  return {
    taskType: "adversary-analysis",
    current,
    proposed: proposed.length >= 2 ? proposed : current, // guardrail
    reasons,
  };
}
