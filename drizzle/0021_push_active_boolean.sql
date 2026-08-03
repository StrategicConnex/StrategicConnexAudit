-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0021: push_subscriptions.active text → boolean (TSK-009 / MAT-207)
--
-- CONTEXTO: el plan P1 (TSK-009) corrige el tipo de la columna `active` de
-- push_subscriptions, que nació como text con DEFAULT 'true' (migración 0009).
-- Los consumidores comparaban `active: 'true'` como string, lo que es propenso
-- a error (coerción implícita, valores no normalizados).
--
-- Esta migración:
--   1. Convierte los valores existentes: 'true'/'TRUE'/'t'/'1' → true, el resto → false.
--   2. Cambia el tipo a boolean NOT NULL con DEFAULT true.
--
-- El índice idx_push_subs_active (btree) sobre una columna boolean es válido,
-- por lo que no requiere drop/recreate. Los schemas Drizzle ya declaran
-- boolean("active").notNull().default(true) (fuente única) para que drizzle-kit
-- no lo considere drift.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Normalizar valores existentes (text → boolean) antes de cambiar el tipo
UPDATE push_subscriptions
SET active = CASE
  WHEN lower(active) IN ('true', 't', '1', 'yes') THEN 'true'
  ELSE 'false'
END
WHERE active IS NOT NULL;
--> statement-breakpoint

-- 2. Cambiar el tipo de columna (PostgreSQL convierte 'true'/'false' → boolean)
ALTER TABLE push_subscriptions
  ALTER COLUMN active TYPE boolean
  USING (active = 'true');
--> statement-breakpoint

-- 3. Reforzar NOT NULL y DEFAULT (equivalente a boolean().notNull().default(true))
ALTER TABLE push_subscriptions
  ALTER COLUMN active SET DEFAULT true;
--> statement-breakpoint

ALTER TABLE push_subscriptions
  ALTER COLUMN active SET NOT NULL;
--> statement-breakpoint
