-- P3.3 Adversary Simulation — Escenarios MITRE y Ejecuciones

CREATE TABLE IF NOT EXISTS adversary_scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mitre_id TEXT NOT NULL,
  mitre_tactic TEXT NOT NULL,
  mitre_technique TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  detection_advice TEXT,
  executor_type TEXT NOT NULL DEFAULT 'manual',
  executor_command TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  prerequisites TEXT[],
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adversary_mitre_tactic ON adversary_scenarios(mitre_tactic);
CREATE INDEX IF NOT EXISTS idx_adversary_mitre_id ON adversary_scenarios(mitre_id);

CREATE TABLE IF NOT EXISTS adversary_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID REFERENCES adversary_scenarios(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  investigation_id UUID REFERENCES intelligence_investigations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  output TEXT,
  error TEXT,
  detected_by TEXT,
  score_impact INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adversary_runs_project_status ON adversary_runs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_adversary_runs_scenario ON adversary_runs(scenario_id);
