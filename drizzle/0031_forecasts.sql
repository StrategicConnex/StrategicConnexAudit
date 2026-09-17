-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0031: tabla forecasts (C-1, predicción a 14 días)
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  current_value NUMERIC(14, 4) NOT NULL,
  predicted_value NUMERIC(14, 4) NOT NULL,
  horizon_days INTEGER NOT NULL DEFAULT 14,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  sample_days INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecasts_project_metric
  ON forecasts (project_id, metric);

-- Unicidad para el upsert semanal (una fila viva por proyecto/métrica).
CREATE UNIQUE INDEX IF NOT EXISTS uq_forecasts_project_metric
  ON forecasts (project_id, metric);

ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON forecasts TO authenticated;

DROP POLICY IF EXISTS forecasts_member_access ON forecasts;
CREATE POLICY forecasts_member_access ON forecasts FOR ALL TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
