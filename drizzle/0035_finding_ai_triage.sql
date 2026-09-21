-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0035: triage IA en intelligence_findings (Sprint 2 roadmap IA)
--
-- Idea #1: clasificación IA por finding (severidad calibrada, CVSS, MITRE,
-- CWE, impacto de negocio, remediación) guardada en el propio finding.
-- Columnas nullable: los findings existentes quedan como "pendientes" y el
-- sweep diario los va procesando.
--
-- 100% IDEMPOTENTE (guards IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "intelligence_findings" ADD COLUMN IF NOT EXISTS "ai_triage" jsonb;
--> statement-breakpoint

ALTER TABLE "intelligence_findings" ADD COLUMN IF NOT EXISTS "ai_triage_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_intel_findings_triage_pending"
  ON "intelligence_findings" ("project_id") WHERE "ai_triage" IS NULL;
