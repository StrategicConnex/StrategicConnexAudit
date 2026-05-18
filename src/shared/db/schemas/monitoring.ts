import {
  pgTable, uuid, varchar, text, timestamp,
  jsonb, boolean, index
} from "drizzle-orm/pg-core";
import { users, projects } from "./index";

// ─── 1. Programación de Monitoreo Activo (Schedules) ──────────────────────────
export const monitoringSchedules = pgTable("monitoring_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  interval: varchar("interval", { length: 50 }).notNull().default("weekly"), // daily, weekly, monthly
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_monitoring_schedules_project").on(t.projectId),
]);

// ─── 2. Registro de Alertas de Drift de Seguridad ─────────────────────────────
export const monitoringAlerts = pgTable("monitoring_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  scheduleId: uuid("schedule_id").references(() => monitoringSchedules.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: varchar("severity", { length: 50 }).$type<"critical" | "warning" | "info">().notNull().default("warning"),
  resolved: boolean("resolved").default(false).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_monitoring_alerts_project_resolved").on(t.projectId, t.resolved),
]);

// ─── 3. Keys de Desarrollo de la API ─────────────────────────────────────────
export const developerApiKeys = pgTable("developer_api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(), // sa_live_
  hashedKey: text("hashed_key").notNull(), // SHA-256 string
  scope: jsonb("scope").$type<string[]>().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_developer_api_keys_user").on(t.userId),
]);

// ─── 4. Destinos Webhook para Integración ─────────────────────────────────────
export const webhookConfigs = pgTable("webhook_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secretToken: text("secret_token").notNull(),
  events: jsonb("events").$type<string[]>().default([]), // ["audit.completed", "alert.triggered"]
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_webhook_configs_project").on(t.projectId),
]);
