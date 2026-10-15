/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Lógica pura de la verificación de retención (P2-14).

   POR QUÉ EXISTE: la parte de la verificación que DECIDE (qué tablas, qué
   predicado, cómo se lee un plan, cuándo el resultado es una regresión) no
   necesita base de datos. Vivía dentro del CLI `db/retention-index-check.mjs`,
   y un script con efecto de nivel superior (abre conexión al importarse) no se
   puede testear — importarlo en una suite dispararía la conexión entera. Al
   separarla aquí, `tests/db/retention-index-check.test.ts` ejercita el parser
   de planes y la matriz de veredictos sin credenciales, y el CLI queda como
   pura orquestación de E/S.

   El vínculo con `src/trigger/cleanup.trigger.ts` es INTENCIONAL: la ventana de
   retención y las 4 tablas declaradas aquí son las que esa task borra, y la
   migración 0051 indexa exactamente esa columna. Si la task cambia de ventana o
   de tablas, esta verificación deja de describir lo que corre en producción.
   ═══════════════════════════════════════════════════════════════════════ */

/** Las 4 tablas de retención P2-14 y su índice declarado en la migración 0051. */
export const RETENTION_TARGETS = [
  { table: "app_logs", index: "idx_app_logs_created_at", retentionDays: 30 },
  {
    table: "intelligence_run_events",
    index: "idx_intelligence_run_events_created_at",
    retentionDays: 30,
  },
  {
    table: "intelligence_tool_runs",
    index: "idx_intelligence_tool_runs_created_at",
    retentionDays: 30,
  },
  {
    table: "intelligence_usage_events",
    index: "idx_intelligence_usage_events_created_at",
    retentionDays: 30,
  },
];

/** Migración que declara los 4 índices (referenciada por los tests). */
export const RETENTION_MIGRATION = "0051_retention_indexes";

/** Ventana de retención evaluada: la misma que aplica `cleanup.trigger.ts`. */
export const RETENTION_DAYS = RETENTION_TARGETS[0].retentionDays;

/**
 * Predicado de retención tal como lo emite drizzle (`lt(createdAt, cutoff)`).
 *
 * @param {number} days
 * @returns {string}
 */
export function predicateFor(days = RETENTION_DAYS) {
  return `created_at < now() - interval '${days} days'`;
}

/** `ANALYZE` de las 4 tablas (refresca estadísticas; no destructivo). */
export function buildAnalyzeSql() {
  return RETENTION_TARGETS.map((t) => `ANALYZE ${t.table};`).join("\n");
}

/**
 * `EXPLAIN (ANALYZE, BUFFERS)` de cada DELETE de retención. Ojo: EXPLAIN ANALYZE
 * sobre un DELETE *ejecuta* la sentencia, así que el consumidor DEBE envolverlo
 * en BEGIN/ROLLBACK.
 */
export function buildExplainSql() {
  return RETENTION_TARGETS.map(
    (t) =>
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\n  DELETE FROM ${t.table} WHERE ${predicateFor(t.retentionDays)};`
  ).join("\n\n");
}

/**
 * Lee un plan textual de Postgres (`EXPLAIN ... FORMAT TEXT`).
 *
 * @param {string} planText
 * @returns {{ indexNames: string[], seqScan: boolean, bitmap: boolean, execTime: number, buffers?: number }}
 */
export function classifyPlan(planText) {
  const indexNames = [
    ...planText.matchAll(/(?:Index(?:\s+Only)?\s+Scan using|Bitmap Index Scan on)\s+(\S+)/g),
  ].map((m) => m[1].trim());
  const seqScan = /Seq Scan on (\S+)/.test(planText);
  const bitmap = /Bitmap (?:Index|Heap) Scan/.test(planText);
  const execTime = Number((planText.match(/Execution Time: ([\d.]+) ms/) || [])[1]);
  // La línea de buffers varía: `shared` en tablas permanentes, `local` en
  // temporales, y puede traer `hit`, `read`, `written`, `dirtied`. Se suma todo
  // para tener una cifra comparable entre planes.
  const buffersLine = planText.match(/Buffers:\s*(.+)/)?.[1];
  const buffers = buffersLine
    ? [...buffersLine.matchAll(/([a-z_]+)=(\d+)/g)].reduce((sum, m) => sum + Number(m[2]), 0)
    : undefined;
  return { indexNames, seqScan, bitmap, execTime, buffers };
}

/**
 * Veredicto por tabla. Distingue las dos causas posibles de un seq scan, que
 * tienen consecuencias opuestas:
 *   · tabla pequeña → el índice no compensa todavía, no es regresión;
 *   · índice que no cubre el predicado → regresión real de P2-14.
 * El `forcedPlan` (mismo DELETE con `enable_seqscan = off`) es lo que separa
 * ambos casos: si forzado tampoco aparece el índice, el problema es el índice.
 *
 * @param {{ indexExists: boolean, plan?: object|null, forcedPlan?: object|null }} input
 * @returns {{ status: "ok"|"warn"|"fail", reason: string }}
 */
export function verdictFor({ indexExists, plan, forcedPlan }) {
  if (!indexExists) return { status: "fail", reason: "índice ausente en la base de datos" };
  if (!plan) return { status: "warn", reason: "no se pudo obtener el plan de ejecución" };
  if (plan.indexNames?.length > 0) return { status: "ok", reason: "el planificador usa el índice" };
  if (plan.bitmap) return { status: "ok", reason: "bitmap index scan sobre el índice" };
  if (forcedPlan?.indexNames?.length > 0) {
    return {
      status: "ok",
      reason:
        "seq scan por tamaño/selectividad, pero el índice cubre el predicado (proof: enable_seqscan=off)",
    };
  }
  if (forcedPlan && forcedPlan.indexNames?.length === 0) {
    return {
      status: "fail",
      reason: "ni forzando el planificador usa el índice: el predicado no está cubierto",
    };
  }
  return { status: "warn", reason: "seq scan y no se pudo comprobar la usabilidad forzada" };
}

/**
 * Mediana de una lista de números (no muta la entrada).
 *
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
