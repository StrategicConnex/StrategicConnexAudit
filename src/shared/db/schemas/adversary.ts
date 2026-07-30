/**
 * adversary.ts — Adversary Simulation Schema (P3.3)
 *
 * Almacena escenarios de simulación tipo Atomic Red Team y los resultados
 * de ejecuciones por proyecto. Cada escenario está mapeado a MITRE ATT&CK.
 */

import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, boolean, index
} from "drizzle-orm/pg-core";
import { projects } from "./index";
import { intelligenceInvestigations } from "./intelligence";

// ─── Catálogo de Escenarios (Template) ─────────────────────────────────────

export const adversaryScenarios = pgTable("adversary_scenarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  mitreId: text("mitre_id").notNull(),          // e.g., T1078.001
  mitreTactic: text("mitre_tactic").notNull(),  // e.g., TA0001
  mitreTechnique: text("mitre_technique").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  detectionAdvice: text("detection_advice"),
  executorType: text("executor_type").notNull().default("manual"),
  executorCommand: text("executor_command"),
  severity: text("severity").notNull().default("medium"),
  prerequisites: text("prerequisites").array(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adversary_mitre_tactic").on(t.mitreTactic),
  index("idx_adversary_mitre_id").on(t.mitreId),
]);

// ─── Ejecuciones de Escenarios por Proyecto ────────────────────────────────

export const adversaryRuns = pgTable("adversary_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id").references(() => adversaryScenarios.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  result: text("result"),                       // detected, missed, error
  output: text("output"),
  error: text("error"),
  detectedBy: text("detected_by"),              // e.g., "EDR", "SIEM", "Manual"
  scoreImpact: integer("score_impact"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adversary_runs_project_status").on(t.projectId, t.status),
  index("idx_adversary_runs_scenario").on(t.scenarioId),
]);


// ─── Tipos exportados ──────────────────────────────────────────────────────

export type AdversaryScenario = typeof adversaryScenarios.$inferSelect;
export type AdversaryScenarioInsert = typeof adversaryScenarios.$inferInsert;
export type AdversaryRun = typeof adversaryRuns.$inferSelect;
export type AdversaryRunInsert = typeof adversaryRuns.$inferInsert;
