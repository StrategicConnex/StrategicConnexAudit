-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0029: tabla ai_report_jobs (P2-1, informes SEO diferidos)
--
-- La ruta POST crea la fila en `pending` y dispara el task; el cliente hace
-- polling hasta completed/failed. Incluye su policy RLS (member_or_owner).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  report TEXT,
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  model_used TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_report_jobs_project_created
  ON ai_report_jobs (project_id, created_at);

-- RLS: lectura/escritura para owner o miembro (mismo predicado fase 2).
ALTER TABLE ai_report_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON ai_report_jobs TO authenticated;

DROP POLICY IF EXISTS ai_report_jobs_member_access ON ai_report_jobs;
CREATE POLICY ai_report_jobs_member_access ON ai_report_jobs FOR ALL TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
