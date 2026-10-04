import {
  pgTable, uuid, text, timestamp, integer,
  numeric, jsonb, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { projects } from "./index";

export type ForecastMetric = "latency_ms" | "uptime_risk" | "keyword_position";

/**
 * forecast.ts — Predicciones a 14 días por proyecto/métrica (C-1).
 *
 * Una fila viva por (projectId, metric): el job semanal la recalcula
 * (upsert). Nunca es promesa: incluye confianza (R²) y la UI la muestra
 * como tendencia, no como garantía.
 */
export const forecasts = pgTable("forecasts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  metric: text("metric").$type<ForecastMetric>().notNull(),
  currentValue: numeric("current_value", { precision: 14, scale: 4 }).notNull(),
  predictedValue: numeric("predicted_value", { precision: 14, scale: 4 }).notNull(),
  horizonDays: integer("horizon_days").notNull().default(14),
  /** R² 0..1 de la regresión (baja = tendencia poco fiable). */
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
  sampleDays: integer("sample_days").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Único por (projectId, metric): paridad con uq_forecasts_project_metric
  // de 0031_forecasts.sql. El upsert del weekly-forecast usa este arbiter
  // en onConflictDoUpdate; declararlo unique evita que drizzle-kit generate
  // proponga dropearlo.
  uniqueIndex("uq_forecasts_project_metric").on(t.projectId, t.metric),
  index("idx_forecasts_project_metric").on(t.projectId, t.metric),
]);
