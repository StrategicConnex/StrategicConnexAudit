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
  pgTable, uuid, text, timestamp, integer, boolean, doublePrecision,
  jsonb, index
} from "drizzle-orm/pg-core";
import { projects } from "./index";

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

/**
 * Uso de IA por usuario y task (presupuesto anti-ruina P0-1).
 * Una fila por llamada a callAIWithFallback (éxito o fallo). Escritura
 * fire-and-forget: jamás bloquea ni rompe la respuesta al usuario.
 */
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").defaultRandom().primaryKey(),

  /** Usuario que originó la llamada (null = sistema/cron sin usuario) */
  userId: uuid("user_id"),

  /** AITaskType: copilot-remediation | incident-brief | general-chat | seo-report | adversary-analysis */
  taskType: text("task_type").notNull(),

  /** Modelo que respondió (o último intentado si falló) */
  modelUsed: text("model_used").notNull().default("none"),

  /** Tokens estimados (los :free no siempre reportan uso: nullable) */
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),

  /** Latencia total de la llamada con fallbacks (ms) */
  latencyMs: integer("latency_ms"),

  /** true = algún modelo respondió; incluye fromCache */
  success: boolean("success").notNull().default(false),

  /** true = servido desde caché (no consumió cuota del proveedor) */
  fromCache: boolean("from_cache").notNull().default(false),

  /** Coste estimado USD de la llamada (Sprint 1 #17; 0/nulo para :free). */
  costUsd: doublePrecision("cost_usd"),

  /** Hash de versión del prompt (Sprint 1 #18; evals reproducibles). */
  promptVersion: text("prompt_version"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_ai_usage_user_created").on(t.userId, t.createdAt),
  index("idx_ai_usage_task_created").on(t.taskType, t.createdAt),
  index("idx_ai_usage_prompt_version").on(t.promptVersion),
]);

/**
 * Trabajos diferidos de informe SEO (P2-1).
 *
 * La ruta POST crea la fila en `pending` y dispara el task; el cliente hace
 * polling al endpoint de estado hasta `completed`/`failed`. Sin Trigger.dev
 * disponible la ruta genera en línea (mismo servicio) y marca completed.
 */
export const aiReportJobs = pgTable("ai_report_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id"),
  status: text("status").notNull().default("pending"),
  report: text("report"),
  isFallback: boolean("is_fallback").notNull().default(false),
  modelUsed: text("model_used"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_ai_report_jobs_project_created").on(t.projectId, t.createdAt),
]);
