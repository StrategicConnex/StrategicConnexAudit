-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0036: resúmenes ejecutivos IA por proyecto (Sprint 3 roadmap IA)
--
-- Idea #2: briefing no técnico redactado por IA tras cada auditoría completa,
-- mostrado en el portal cliente (/p/[token]). 1 fila VIVA por proyecto
-- (replaced_at IS NULL); al generarse una nueva, la anterior se cierra con
-- replaced_at → historial sin consultas adicionales. El índice único parcial
-- garantiza la unicidad de la fila viva a nivel BD (carreras de triggers).
--
-- 100% IDEMPOTENTE (guards IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "exec_briefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  -- Markdown-lite listo para el portal (headline ## + párrafos + listas -).
  "content" text NOT NULL,
  -- true = mensaje de degradación graciosa (IA sin configurar / salida inválida).
  "is_fallback" boolean DEFAULT false NOT NULL,
  -- Modelo que redactó (null en fallback).
  "model_used" text,
  -- Versión del prompt (evals reproducibles, mismo criterio que ai_usage).
  "prompt_version" integer DEFAULT 1 NOT NULL,
  -- Auditoría que originó el brief (nullable: regeneración manual).
  "audit_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- NULL = fila viva (la actual). Fecha = reemplazada por una más nueva.
  "replaced_at" timestamp with time zone
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exec_briefs_project_live"
  ON "exec_briefs" ("project_id") WHERE "replaced_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_exec_briefs_project_created"
  ON "exec_briefs" ("project_id", "created_at");
