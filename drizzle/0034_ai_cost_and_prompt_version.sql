-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0034: coste y versión de prompt en ai_usage (Sprint 1 roadmap IA)
--
-- Ideas #17 y #18: telemetría de coste estimado (USD) y hash de versión de
-- prompt por llamada. Columnas nullable: las filas históricas quedan sin
-- coste/versión (no se retrocalcula) y el código nuevo las rellena.
--
-- 100% IDEMPOTENTE: seguro de re-ejecutar (guards IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "cost_usd" double precision;
--> statement-breakpoint

ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "prompt_version" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_ai_usage_prompt_version" ON "ai_usage" ("prompt_version");
