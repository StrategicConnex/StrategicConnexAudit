-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0041: plataforma — idempotencia (A6) y outbox transaccional (C6)
--
-- A6: `idempotency_keys` da una garantía de "efecto a lo sumo una vez" a los
--     endpoints mutadores (webhooks, ai/report, intelligence/runs). La clave la
--     aporta el cliente en `Idempotency-Key`; el servidor reclama la fila con
--     `INSERT … ON CONFLICT DO NOTHING` y sirve la respuesta guardada en un
--     reintento. Acceso solo backend vía `directDb` → RLS sin policies
--     (patrón `rate_limit_windows`, fail-closed).
--
-- C6: `outbox_events` es el registro durable de eventos salientes. La fila se
--     inserta en la MISMA transacción que el cambio de dominio (el productor
--     corre como `authenticated` dentro de `withRLS`), de modo que un evento
--     nunca se pierde ni se emite si la transacción revierte. El rol
--     `authenticated` solo puede ENCOLAR eventos de proyectos a los que tiene
--     acceso; la lectura/actualización la hace el drenador con `directDb`
--     (dueño de la tabla → bypass de RLS). El claim reutiliza la mecánica de
--     `scan_queue` (`FOR UPDATE SKIP LOCKED`, attempts, backoff exponencial).
--
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS) para poder aplicarse a
-- mano sobre la BD viva.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ 1. Claves de idempotencia (A6) ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_key" text NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint

-- Una clave de idempotencia es única por usuario + endpoint: dos usuarios
-- pueden usar el mismo valor de header sin pisarse.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_idempotency_scope"
  ON "idempotency_keys" ("endpoint", "user_id", "scope_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_idempotency_expires_at"
  ON "idempotency_keys" ("expires_at");
--> statement-breakpoint

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ══ 2. Outbox de eventos salientes (C6) ═════════════════════════════════════

CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "aggregate_type" text,
  "aggregate_id" text,
  "project_id" uuid,
  "payload" jsonb DEFAULT '{}' NOT NULL,
  "dedupe_key" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 8 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "claimed_by" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- `dedupe_key` opcional (NULL permitido tantas veces como haga falta): si se
-- aporta, un segundo INSERT con la misma clave no crea otra fila.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outbox_dedupe" ON "outbox_events" ("dedupe_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_outbox_claim" ON "outbox_events" ("status", "available_at");
--> statement-breakpoint

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- El productor (rol authenticated, dentro de withRLS) solo puede ENCOLAR
-- eventos de proyectos a los que tiene acceso. No hay policy SELECT/UPDATE/
-- DELETE: el drenador corre con `directDb` (dueño → bypass de RLS).
GRANT INSERT ON "outbox_events" TO authenticated;
--> statement-breakpoint

DROP POLICY IF EXISTS "outbox_events_insert_member" ON "outbox_events";
--> statement-breakpoint

CREATE POLICY "outbox_events_insert_member" ON "outbox_events"
  FOR INSERT TO authenticated
  WITH CHECK (project_id IS NULL OR public.user_has_project_access(project_id));
