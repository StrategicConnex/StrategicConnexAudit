import {
  pgTable, uuid, text, timestamp, jsonb, index
} from "drizzle-orm/pg-core";
import { projects } from "./index";

export type RemediationStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "verified"
  | "failed";

export type RemediationConnector =
  | "cloudflare.purge_cache"
  | "wordpress.update_plugin"
  | "github.create_issue"
  | "http.request";

/**
 * remediation_actions — Motor de remediación (C-2).
 *
 * De recomendar a ejecutar: la acción nace `proposed` (desde un hallazgo o
 * manual), un humano la aprueba (`approved`) y el motor la ejecuta
 * (`executing` → `verified`/`failed`). Los secretos del conector viajan
 * CIFRADOS en `configEncrypted` (field-crypto); jamás en claro.
 */
export const remediationActions = pgTable("remediation_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  connector: text("connector").$type<RemediationConnector>().notNull(),
  /** Config del conector CIFRADA (tokens, passwords). */
  configEncrypted: text("config_encrypted"),
  /** Pasos propuestos (texto humano, del hallazgo o manual). */
  steps: jsonb("steps").$type<string[]>().default([]),
  status: text("status").$type<RemediationStatus>().notNull().default("proposed"),
  /** Evidencia de ejecución/verificación (URLs, respuestas resumidas). */
  result: jsonb("result").$type<Record<string, unknown>>().default({}),
  assessmentId: uuid("assessment_id"),
  vulnerabilityTitle: text("vulnerability_title"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_remediation_project_status").on(t.projectId, t.status),
]);
