-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0023: policies de ESCRITURA en tablas de inteligencia (CHANGE-003 fix)
--
-- CONTEXTO: la migración 0022 habilitó RLS con policies SOLO SELECT en las 4
-- tablas realtime. Pero el server escribe esas tablas DENTRO de withRLS()
-- (SET ROLE authenticated): /api/intelligence, /api/intelligence/investigations,
-- /api/intelligence/runs, /api/bulk-scan. Sin policies de escritura, esos
-- INSERT/UPDATE fallan con 42501 ("new row violates row-level security policy").
--
-- Este cambio añade policies de escritura con el MISMO patrón member_or_owner
-- (WITH CHECK sobre project_id en la membresía del usuario). run_events no tiene
-- project_id → valida vía subquery de intelligence_investigations. tool_runs tiene
-- RLS DESHABILITADO (no estaba en 0022) pero se escribe vía withRLS → se le activa
-- RLS y se le añaden policies SELECT+INSERT para que sus escrituras funcionen y
-- sus lecturas queden aisladas.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper (expresión SQL repetida): membresía = owner de projects O miembro
-- de project_members. El sub viene de current_setting('request.jwt.claims').

-- 1. intelligence_investigations — INSERT (crear investigación) + UPDATE (estado/score)
DROP POLICY IF EXISTS "intelligence_investigations_insert_member_or_owner" ON intelligence_investigations;
--> statement-breakpoint

CREATE POLICY "intelligence_investigations_insert_member_or_owner" ON intelligence_investigations
  FOR INSERT TO authenticated
  WITH CHECK (
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

DROP POLICY IF EXISTS "intelligence_investigations_update_member_or_owner" ON intelligence_investigations;
--> statement-breakpoint

CREATE POLICY "intelligence_investigations_update_member_or_owner" ON intelligence_investigations
  FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      WHERE p.owner_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
         OR p.id IN (
              SELECT pm.project_id FROM project_members pm
              WHERE pm.user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
            )
    )
  )
  WITH CHECK (
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

-- 2. intelligence_findings — INSERT (resultados de scan)
DROP POLICY IF EXISTS "intelligence_findings_insert_member_or_owner" ON intelligence_findings;
--> statement-breakpoint

CREATE POLICY "intelligence_findings_insert_member_or_owner" ON intelligence_findings
  FOR INSERT TO authenticated
  WITH CHECK (
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

-- 3. intelligence_assets — INSERT (activos descubiertos)
DROP POLICY IF EXISTS "intelligence_assets_insert_member_or_owner" ON intelligence_assets;
--> statement-breakpoint

CREATE POLICY "intelligence_assets_insert_member_or_owner" ON intelligence_assets
  FOR INSERT TO authenticated
  WITH CHECK (
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

-- 4. intelligence_run_events — INSERT (streaming). NO tiene project_id → valida
--    vía subquery de investigations (misma membresía).
DROP POLICY IF EXISTS "intelligence_run_events_insert_member_or_owner" ON intelligence_run_events;
--> statement-breakpoint

CREATE POLICY "intelligence_run_events_insert_member_or_owner" ON intelligence_run_events
  FOR INSERT TO authenticated
  WITH CHECK (
    investigation_id IN (
      SELECT i.id FROM intelligence_investigations i
      WHERE i.project_id IN (
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

-- 5. intelligence_tool_runs — se escribe vía withRLS y NO tenía RLS (quedó fuera
--    de 0022). Se habilita RLS + SELECT + INSERT para cerrar la fuga y permitir
--    la escritura server-side.
GRANT SELECT, INSERT ON intelligence_tool_runs TO authenticated;
--> statement-breakpoint

ALTER TABLE intelligence_tool_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "intelligence_tool_runs_select_member_or_owner" ON intelligence_tool_runs;
--> statement-breakpoint

CREATE POLICY "intelligence_tool_runs_select_member_or_owner" ON intelligence_tool_runs
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

DROP POLICY IF EXISTS "intelligence_tool_runs_insert_member_or_owner" ON intelligence_tool_runs;
--> statement-breakpoint

CREATE POLICY "intelligence_tool_runs_insert_member_or_owner" ON intelligence_tool_runs
  FOR INSERT TO authenticated
  WITH CHECK (
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
