/**
 * adversary.ts — Adversary Simulation Schema (P3.3)
 *
 * Almacena escenarios de simulación tipo Atomic Red Team y los resultados
 * de ejecuciones por proyecto. Cada escenario está mapeado a MITRE ATT&CK.
 */

import {
  pgTable, uuid, text, timestamp, integer, boolean,
  jsonb, index, pgEnum, uniqueIndex, numeric
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { projects, users } from "./index";
import { intelligenceInvestigations, targetTypeEnum } from "./intelligence";

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
  // Índice ÚNICO: garantiza que cada mitre_id del catálogo tenga una sola
  // fila template. Cierra la race condition de getOrCreateScenarioId (dos
  // POSTs concurrentes o POST+cron insertando duplicados). Migración 0018.
  uniqueIndex("uniq_adversary_mitre_id").on(t.mitreId),
]);

// ─── Ejecuciones de Escenarios por Proyecto ────────────────────────────────

export const adversaryRuns = pgTable("adversary_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  scenarioId: uuid("scenario_id").references(() => adversaryScenarios.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  investigationId: uuid("investigation_id").references(() => intelligenceInvestigations.id, { onDelete: "set null" }),
  engagementId: uuid("engagement_id").references(() => adversaryEngagements.id, { onDelete: "set null" }),

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
  index("idx_adversary_runs_engagement").on(t.engagementId),
]);


// ─── PTT: Enums de máquina de estados (P3.5) ───────────────────────────────
// Inspirado en PentestGPT: el Pentesting Task Tree (PTT) es una máquina de
// estados jerárquica que ancla la memoria del agente a un árbol estructurado
// de objetivos en vez de un historial de chat desordenado.

export const engagementStatusEnum = pgEnum("engagement_status", [
  "draft", "planning", "running", "completed", "failed", "canceled"
]);

export const taskNodeStatusEnum = pgEnum("task_node_status", [
  "pending", "queued", "running", "completed", "failed", "blocked", "skipped", "canceled"
]);

export const taskNodeResultEnum = pgEnum("task_node_result", [
  "pending", "detected", "missed", "error", "not_applicable"
]);

// ─── PTT: Engagement de Adversario (Sesión raíz) ───────────────────────────
// Una sesión de simulación de adversario sobre un target. Es la raíz del árbol
// de tareas y el equivalente a la sesión persistida de PentestGPT (permite
// pausar/reanudar campañas de varios días).

export const adversaryEngagements = pgTable("adversary_engagements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  target: text("target").notNull(),
  targetType: targetTypeEnum("target_type").notNull().default("domain"),
  status: engagementStatusEnum("status").notNull().default("draft"),
  strategy: jsonb("strategy").$type<Record<string, unknown>>().default({}),
  score: integer("score"),
  summary: text("summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adv_engagements_project_status").on(t.projectId, t.status),
  index("idx_adv_engagements_project_created").on(t.projectId, t.createdAt),
]);

// ─── PTT: Task Nodes (Árbol de tareas) ─────────────────────────────────────
// Nodos del árbol jerárquico. Cada nodo referencia un escenario del catálogo
// MITRE (o es un nodo de planificación puro del LLM) y tiene su propia máquina
// de estados + resultado de detección. parent_id + depth permiten reconstruir
// el árbol completo y serializarlo como sesión reanudable.

export const adversaryTaskNodes = pgTable("adversary_task_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id").references(() => adversaryEngagements.id, { onDelete: "cascade" }).notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => adversaryTaskNodes.id, { onDelete: "set null" }),
  scenarioId: uuid("scenario_id").references(() => adversaryScenarios.id, { onDelete: "set null" }),
  mitreId: text("mitre_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: taskNodeStatusEnum("status").notNull().default("pending"),
  result: taskNodeResultEnum("result").notNull().default("pending"),
  executorType: text("executor_type").notNull().default("manual"),
  executorCommand: text("executor_command"),
  input: jsonb("input").$type<Record<string, unknown>>().default({}),
  output: jsonb("output").$type<Record<string, unknown>>(),
  outputText: text("output_text"),
  error: text("error"),
  detectedBy: text("detected_by"),
  scoreImpact: integer("score_impact"),
  depth: integer("depth").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adv_task_nodes_engagement").on(t.engagementId),
  index("idx_adv_task_nodes_engagement_parent").on(t.engagementId, t.parentId),
  index("idx_adv_task_nodes_engagement_status").on(t.engagementId, t.status),
  index("idx_adv_task_nodes_scenario").on(t.scenarioId),
  index("idx_adv_task_nodes_mitre").on(t.mitreId),
]);

// ─── Evaluación Real de Adversarios (no destructiva) ───────────────────────
// Una ejecución completa del motor de checks reales contra el dominio del
// proyecto. Requiere projects.active_testing_authorized = true (consentimiento).
export const adversaryAssessments = pgTable("adversary_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull().default("pending"),
  target: text("target").notNull(),
  riskScore: integer("risk_score"),
  summary: text("summary"),
  modelUsed: text("model_used"),
  evidenceCount: integer("evidence_count").notNull().default(0),
  checksTotal: integer("checks_total").notNull().default(0),
  checksPassed: integer("checks_passed").notNull().default(0),
  rawEvidence: jsonb("raw_evidence").$type<Record<string, unknown>>(),
  analysisFailed: boolean("analysis_failed").notNull().default(false),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adv_assessments_project_status").on(t.projectId, t.status),
  index("idx_adv_assessments_project_created").on(t.projectId, t.createdAt),
]);

export const adversaryVulnerabilities = pgTable("adversary_vulnerabilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentId: uuid("assessment_id").references(() => adversaryAssessments.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull(),
  cvssScore: numeric("cvss_score", { precision: 3, scale: 1 }),
  cweId: text("cwe_id"),
  owaspCategory: text("owasp_category"),
  mitreId: text("mitre_id"),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  remediation: text("remediation").array().notNull().default([]),
  references: text("references").array().notNull().default([]),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("0.80"),
  aiModel: text("ai_model"),
  falsePositive: boolean("false_positive").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  index("idx_adv_vulns_assessment_severity").on(t.assessmentId, t.severity),
]);

// ─── Tipos exportados ──────────────────────────────────────────────────────

export type AdversaryScenario = typeof adversaryScenarios.$inferSelect;
export type AdversaryScenarioInsert = typeof adversaryScenarios.$inferInsert;
export type AdversaryRun = typeof adversaryRuns.$inferSelect;
export type AdversaryRunInsert = typeof adversaryRuns.$inferInsert;
export type AdversaryEngagement = typeof adversaryEngagements.$inferSelect;
export type AdversaryEngagementInsert = typeof adversaryEngagements.$inferInsert;
export type AdversaryTaskNode = typeof adversaryTaskNodes.$inferSelect;
export type AdversaryTaskNodeInsert = typeof adversaryTaskNodes.$inferInsert;
export type AdversaryAssessment = typeof adversaryAssessments.$inferSelect;
export type AdversaryAssessmentInsert = typeof adversaryAssessments.$inferInsert;
export type AdversaryVulnerability = typeof adversaryVulnerabilities.$inferSelect;
export type AdversaryVulnerabilityInsert = typeof adversaryVulnerabilities.$inferInsert;
