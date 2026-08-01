-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0017: PTT — Pentesting Task Tree (Engagements + Task Nodes)
--
-- CONTEXTO: el módulo adversario ejecuta escenarios sueltos (adversary_runs)
-- sin sesión estructurada ni árbol de tareas. Este esquema agrega la base del
-- motor de ejecución real inspirado en PentestGPT (GreyDGL):
--   · adversary_engagements — sesión de simulación (raíz del árbol, reanudable)
--   · adversary_task_nodes  — nodos del árbol jerárquico con máquina de estados
--   · adversary_runs.engagement_id — FK retro-compatible para atribuir runs
--
-- Enums (idempotentes vía DO $$):
--   · engagement_status: draft → planning → running → completed/failed/canceled
--   · task_node_status:  pending → queued → running → completed/failed/blocked/skipped/canceled
--   · task_node_result:  pending/detected/missed/error/not_applicable
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Enums de máquina de estados (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagement_status') THEN
    CREATE TYPE engagement_status AS ENUM (
      'draft', 'planning', 'running', 'completed', 'failed', 'canceled'
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_node_status') THEN
    CREATE TYPE task_node_status AS ENUM (
      'pending', 'queued', 'running', 'completed', 'failed', 'blocked', 'skipped', 'canceled'
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_node_result') THEN
    CREATE TYPE task_node_result AS ENUM (
      'pending', 'detected', 'missed', 'error', 'not_applicable'
    );
  END IF;
END $$;
--> statement-breakpoint

-- 2. Engagements — sesión raíz de simulación de adversario
CREATE TABLE IF NOT EXISTS adversary_engagements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  target_type target_type NOT NULL DEFAULT 'domain',  -- enum pre-existente (migración 0000)
  status engagement_status NOT NULL DEFAULT 'draft',
  strategy JSONB DEFAULT '{}'::jsonb,
  score INTEGER,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_engagements_project_status
  ON adversary_engagements USING btree (project_id, status);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_engagements_project_created
  ON adversary_engagements USING btree (project_id, created_at);
--> statement-breakpoint

-- 3. Task Nodes — árbol jerárquico de tareas
CREATE TABLE IF NOT EXISTS adversary_task_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID REFERENCES adversary_engagements(id) ON DELETE CASCADE NOT NULL,
  parent_id UUID REFERENCES adversary_task_nodes(id) ON DELETE SET NULL,
  scenario_id UUID REFERENCES adversary_scenarios(id) ON DELETE SET NULL,
  mitre_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status task_node_status NOT NULL DEFAULT 'pending',
  result task_node_result NOT NULL DEFAULT 'pending',
  executor_type TEXT NOT NULL DEFAULT 'manual',
  executor_command TEXT,
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB,
  output_text TEXT,
  error TEXT,
  detected_by TEXT,
  score_impact INTEGER,
  depth INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_task_nodes_engagement
  ON adversary_task_nodes USING btree (engagement_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_task_nodes_engagement_parent
  ON adversary_task_nodes USING btree (engagement_id, parent_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_task_nodes_engagement_status
  ON adversary_task_nodes USING btree (engagement_id, status);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_task_nodes_scenario
  ON adversary_task_nodes USING btree (scenario_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_adv_task_nodes_mitre
  ON adversary_task_nodes USING btree (mitre_id);
--> statement-breakpoint

-- 4. Retro-compat: atribuir runs existentes al engagement (nullable, no rompe)
ALTER TABLE adversary_runs
  ADD COLUMN IF NOT EXISTS engagement_id UUID
  REFERENCES adversary_engagements(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Índice para atribuir runs por engagement (convención 0015: FK indexado)
CREATE INDEX IF NOT EXISTS idx_adversary_runs_engagement
  ON adversary_runs USING btree (engagement_id);
--> statement-breakpoint

-- 5. RLS — mismo patrón que 0016 (grants + enable + policies member_or_owner)
GRANT SELECT ON adversary_engagements TO authenticated;
--> statement-breakpoint

GRANT SELECT ON adversary_task_nodes TO authenticated;
--> statement-breakpoint

ALTER TABLE adversary_engagements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE adversary_task_nodes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "adversary_engagements_select_member_or_owner" ON adversary_engagements;
--> statement-breakpoint

CREATE POLICY "adversary_engagements_select_member_or_owner" ON adversary_engagements
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.owner_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
         OR p.id IN (
              SELECT pm.project_id FROM project_members pm
              WHERE pm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
            )
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "adversary_task_nodes_select_member_or_owner" ON adversary_task_nodes;
--> statement-breakpoint

CREATE POLICY "adversary_task_nodes_select_member_or_owner" ON adversary_task_nodes
  FOR SELECT TO authenticated
  USING (
    engagement_id IN (
      SELECT e.id FROM adversary_engagements e
      WHERE e.project_id IN (
        SELECT p.id FROM projects p
        WHERE p.owner_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
           OR p.id IN (
                SELECT pm.project_id FROM project_members pm
                WHERE pm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
              )
      )
    )
  );
--> statement-breakpoint
