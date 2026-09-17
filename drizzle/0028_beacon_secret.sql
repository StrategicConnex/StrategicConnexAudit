-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0028: beacon_secret en projects (P0-3, anti DB-bloat RUM)
--
-- El snippet RUM envía este secreto en el cuerpo y /api/telemetry/vitals lo
-- exige cuando está definido. Sin backfill: NULL = proyectos legacy siguen
-- abiertos hasta que el owner genera su secreto desde la tarjeta RUM.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN IF NOT EXISTS beacon_secret TEXT;
