/**
 * health.ts — AI Health Check Schema
 *
 * Registra los resultados de health checks peridicos sobre los modelos
 * de IA configurados en ai-router.ts. Cada fila representa una ejecucin
 * completa del health check (todos los modelos de un task type).
 *
 * til para:
 * - Detectar cundo OpenRouter cambia o depreca modelos :free
 * - Dashboard de salud de IA (tiempo real)
 * - Alertas cuando un modelo deja de responder
 * - Histrico de degradaciones
 */

import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, index
} from "drizzle-orm/pg-core";

/**
 * Resultado agregado de una ejecucin de health check.
 * Contiene el estado de TODOS los modelos testeados en esa ejecucin.
 */
export const aiHealthLogs = pgTable("ai_health_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  /** Timestamp de cundo se ejecut el health check */
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),

  /** Estado global: "healthy" | "degraded" | "unhealthy" */
  overallStatus: text("overall_status").notNull().default("healthy"),

  /** Task type evaluado (ej: "general-chat", o "all" para chequeo completo) */
  taskType: text("task_type").notNull().default("all"),

  /** Cuntos modelos respondieron OK */
  modelsHealthy: integer("models_healthy").notNull().default(0),

  /** Cuntos modelos fallaron */
  modelsFailed: integer("models_failed").notNull().default(0),

  /** Cuntos modelos se testearon en total */
  modelsTotal: integer("models_total").notNull().default(0),

  /** Latencia promedio entre los modelos que respondieron (ms) */
  avgLatencyMs: integer("avg_latency_ms"),

  /** Resultado detallado por modelo — array de objetos */
  modelResults: jsonb("model_results").$type<Array<{
    modelId: string;
    status: "healthy" | "degraded" | "failed";
    latencyMs: number | null;
    error?: string | null;
    responseSample?: string | null;
  }>>().default([]),

  /** Trigger source: "cron" | "manual" | "ci" */
  triggerSource: text("trigger_source").notNull().default("cron"),

  /** Metadata adicional (versin del router, env, etc.) */
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_ai_health_checked_at").on(t.checkedAt),
  index("idx_ai_health_overall_status").on(t.overallStatus),
  index("idx_ai_health_task_type_checked").on(t.taskType, t.checkedAt),
]);
