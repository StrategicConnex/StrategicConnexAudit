/**
 * anomaly.ts — Anomaly Detection Schema (P3.2)
 *
 * Almacena anomalías detectadas por el motor estadístico de moving Z-score
 * sobre series temporales: latencia, uptime, tool errors, etc.
 */

import {
  pgTable, uuid, text, timestamp, integer,
  numeric, jsonb, index
} from "drizzle-orm/pg-core";
import { projects } from "./index";
import { intelligenceInvestigations } from "./intelligence";

export type AnomalyMetricType =
  | "latency"
  | "uptime"
  | "tool_duration"
  | "error_rate"
  | "page_views"
  | "cls"
  | "score";

export type AnomalySeverity = "critical" | "warning" | "info";

export const anomalyDetections = pgTable("anomaly_detections", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "set null" }),
  metricType: text("metric_type").$type<AnomalyMetricType>().notNull(),
  severity: text("severity").$type<AnomalySeverity>().notNull(),
  actualValue: numeric("actual_value", { precision: 12, scale: 4 }).notNull(),
  expectedValue: numeric("expected_value", { precision: 12, scale: 4 }).notNull(),
  zScore: numeric("z_score", { precision: 8, scale: 3 }).notNull(),
  windowSizeHours: integer("window_size_hours").notNull().default(24),
  label: text("label").notNull(),
  detail: text("detail"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_anomaly_project_metric").on(t.projectId, t.metricType),
  index("idx_anomaly_severity_detected").on(t.severity, t.detectedAt),
  index("idx_anomaly_detected_at").on(t.detectedAt),
  index("idx_anomaly_unresolved").on(t.projectId, t.resolvedAt),
]);
