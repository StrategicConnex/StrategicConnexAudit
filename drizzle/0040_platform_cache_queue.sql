-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0040: plataforma — caché distribuida (C2) y cola de escaneo (C3)
--
-- CONTEXTO: los escenarios C2/C3 se escribieron contra Redis, que el proyecto
-- ya no usa (ADR-002 enmiendas 14–15; ver ADR-008). Se re-scopean a Postgres,
-- el mismo `DATABASE_URL`, sin servicios externos ni coste nuevo:
--   * `distributed_cache`: L2 compartido de resultados de tools (key = cache_key).
--   * `scan_queue` + `scan_queue_slots`: cola con `FOR UPDATE SKIP LOCKED` y
--     cupo de concurrencia por plan.
--
-- Acceso: sólo el backend vía `directDb`. RLS habilitada SIN policies (patrón
-- `rate_limit_windows`): anon/authenticated quedan denegados por defecto.
-- Idempotente (IF NOT EXISTS) para poder aplicarse a mano sobre la BD viva.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ 1. Caché distribuida (C2) ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "distributed_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_distributed_cache_expires_at" ON "distributed_cache" ("expires_at");
--> statement-breakpoint

ALTER TABLE "distributed_cache" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ══ 2. Cola de escaneo (C3) ═════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "scan_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" uuid,
  "plan" text DEFAULT 'free' NOT NULL,
  "tool_id" text NOT NULL,
  "target" text NOT NULL,
  "input" jsonb,
  "status" text DEFAULT 'queued' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "claimed_by" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_scan_queue_claim" ON "scan_queue" ("status", "available_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_scan_queue_project" ON "scan_queue" ("project_id");
--> statement-breakpoint

-- Contador de jobs `running` por plan (cupo de concurrencia).
CREATE TABLE IF NOT EXISTS "scan_queue_slots" (
  "plan" text PRIMARY KEY NOT NULL,
  "active" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "scan_queue" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "scan_queue_slots" ENABLE ROW LEVEL SECURITY;
