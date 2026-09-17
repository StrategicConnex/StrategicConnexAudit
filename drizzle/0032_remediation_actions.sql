-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0032: remediation_actions (C-2, motor de remediación)
-- Idempotente. RLS member_or_owner como el resto de tablas por proyecto.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS remediation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  connector TEXT NOT NULL,
  config_encrypted TEXT,
  steps JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed',
  result JSONB DEFAULT '{}',
  assessment_id UUID,
  vulnerability_title TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remediation_project_status
  ON remediation_actions (project_id, status);

ALTER TABLE remediation_actions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON remediation_actions TO authenticated;

DROP POLICY IF EXISTS remediation_actions_member_access ON remediation_actions;
CREATE POLICY remediation_actions_member_access ON remediation_actions FOR ALL TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
