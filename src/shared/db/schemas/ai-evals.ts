/**
 * ai-evals.ts — Resultados del eval continuo del pool (Sprint 4, idea #8).
 *
 * Cada fila es la puntuación de UN caso dorado ejecutado contra UN modelo
 * concreto con UN hash de prompt_version (idea #18). Agrupando por
 * (task_type, model, prompt_version) se comparan modelos entre sí y una
 * versión de prompt contra la anterior de forma reproducible.
 */

import {
  pgTable, uuid, text, timestamp, integer, boolean, doublePrecision, jsonb, index,
} from "drizzle-orm/pg-core";

export const aiEvalResults = pgTable(
  "ai_eval_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Task type evaluado (hoy: adversary-analysis; se extiende por idea). */
    taskType: text("task_type").notNull(),

    /** Caso dorado del dataset (adversary-golden.json, ej. "sql-injection-login"). */
    caseId: text("case_id").notNull(),

    /** Modelo que respondió (slug completo de OpenRouter). */
    model: text("model").notNull(),

    /** Hash sha256 (16 hex) del prompt — promptVersion() de la idea #18. */
    promptVersion: text("prompt_version").notNull(),

    /** Puntuación del scorer 0-100. */
    score: integer("score").notNull(),

    /** true = score >= umbral (hoy 80). */
    passed: boolean("passed").notNull(),

    /** Latencia total de la llamada (ms). */
    latencyMs: integer("latency_ms"),

    /** Tokens reportados por el proveedor (null si no reporta). */
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),

    /** Coste estimado USD (0/nulo en :free). */
    costUsd: doublePrecision("cost_usd"),

    /** true = la llamada no obtuvo respuesta válida (0 en el score). */
    errored: boolean("errored").notNull().default(false),

    /** Detalle: checks fallidos, mensaje de error, notas del runner. */
    detail: jsonb("detail"),

    /** Usuario que lanzó el eval (null = job programado). */
    userId: uuid("user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Comparativa de versiones: evolución de un (modelo, prompt) en el tiempo.
    index("idx_ai_eval_model_prompt").on(t.model, t.promptVersion, t.createdAt),
    // Última ronda: los resultados de una ejecución concreta.
    index("idx_ai_eval_task_created").on(t.taskType, t.createdAt),
  ]
);

export type AiEvalResult = typeof aiEvalResults.$inferSelect;
export type NewAiEvalResult = typeof aiEvalResults.$inferInsert;
