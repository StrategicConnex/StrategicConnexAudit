import {
  pgTable, uuid, text, integer, timestamp, pgEnum,
  jsonb, boolean, numeric, unique, index
} from "drizzle-orm/pg-core";
import { users, projects } from "./index";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const targetTypeEnum = pgEnum("target_type", [
  "domain", "hostname", "url", "ip", "email", "asn", "cidr"
]);

export const investigationStatusEnum = pgEnum("investigation_status", [
  "draft", "queued", "running", "completed", "failed", "canceled"
]);

export const toolRunStatusEnum = pgEnum("tool_run_status", [
  "queued", "running", "completed", "failed", "canceled", "rate_limited"
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "info", "low", "medium", "high", "critical"
]);

// ─── Tablas ───────────────────────────────────────────────────────────────────

// 1. Investigaciones de Inteligencia (Sesiones de Análisis)
export const intelligenceInvestigations = pgTable("intelligence_investigations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  target: text("target").notNull(),
  normalizedTarget: text("normalized_target").notNull(),
  targetType: targetTypeEnum("target_type").notNull(),
  status: investigationStatusEnum("status").notNull().default("draft"),
  score: integer("score"),
  summary: text("summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("idx_intel_investigations_project_created").on(t.projectId, t.createdAt),
  index("idx_intel_investigations_target").on(t.normalizedTarget),
]);

// 2. Ejecuciones de Herramientas de Inteligencia (Tool Runs)
export const intelligenceToolRuns = pgTable("intelligence_tool_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  toolId: text("tool_id").notNull(),
  category: text("category").notNull(),
  status: toolRunStatusEnum("status").notNull().default("queued"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  cacheKey: text("cache_key"),
  durationMs: integer("duration_ms"),
  costUnits: integer("cost_units").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_intel_tool_runs_investigation").on(t.investigationId),
  index("idx_intel_tool_runs_tool_created").on(t.toolId, t.createdAt),
]);

// 3. Hallazgos y Vulnerabilidades Detectadas
export const intelligenceFindings = pgTable("intelligence_findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }).notNull(),
  toolRunId: uuid("tool_run_id").references(() => intelligenceToolRuns.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  severity: findingSeverityEnum("severity").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.700"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}),
  affectedAsset: text("affected_asset"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_intel_findings_project_severity").on(t.projectId, t.severity),
]);

// 4. Activos Descubiertos (Subdominios, IPs, etc.)
export const intelligenceAssets = pgTable("intelligence_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(),
  value: text("value").notNull(),
  ip: text("ip"), // Stored as text for high reliability and type safety
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
}, (t) => [
  unique("uniq_intel_asset_project_type_value").on(t.projectId, t.assetType, t.value),
]);

// 5. Eventos de Ejecución (Logs para streaming interactivo)
export const intelligenceRunEvents = pgTable("intelligence_run_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "cascade" }).notNull(),
  toolRunId: uuid("tool_run_id").references(() => intelligenceToolRuns.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 6. Registro de Métricas de Uso de la API (Quota Billing)
export const intelligenceUsageEvents = pgTable("intelligence_usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  toolId: text("tool_id").notNull(),
  targetHash: text("target_hash").notNull(),
  units: integer("units").notNull().default(1),
  allowed: boolean("allowed").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
