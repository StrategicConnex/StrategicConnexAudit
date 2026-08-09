-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0024: FASE 1 de revisión RLS incremental — tablas con project_id
-- servidas vía withRLS() (CHANGE-004)
--
-- CONTEXTO: RSK-10 — RLS solo en 5/58 tablas (0016/0017) + 4 realtime (0022)
-- + write policies (0023). Esta fase habilita RLS + policy SELECT member_or_owner
-- en las tablas de proyecto que el server lee DENTRO de withRLS()
-- (SET ROLE authenticated): el aislamiento pasa de depender solo del access layer
-- a tener defensa real en la BD (fail-closed si algún cliente Supabase las toca).
--
-- Tablas y patrón:
--   audits                — project_id directo · DML con withRLS: INSERT (triggerAudit)
--                           → policies SELECT + INSERT (WITH CHECK)
--   crawl_results         — sin project_id → subquery vía audits (audit_id)
--   keyword_targets       — project_id directo
--   rank_history          — sin project_id → subquery vía keyword_targets (keyword_id)
--   integration_data_gsc  — project_id directo
--
-- Las escrituras server-side restantes de estas tablas usan directDb/db
-- (rol privilegiado, bypasea RLS) → no requieren policies de escritura.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper (expresión SQL repetida): membresía = owner de projects O miembro
-- de project_members. El sub viene de current_setting('request.jwt.claims').

-- ── 1. audits ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON audits TO authenticated;
--> statement-breakpoint

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "audits_select_member_or_owner" ON audits;
--> statement-breakpoint

CREATE POLICY "audits_select_member_or_owner" ON audits
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

DROP POLICY IF EXISTS "audits_insert_member_or_owner" ON audits;
--> statement-breakpoint

CREATE POLICY "audits_insert_member_or_owner" ON audits
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

-- ── 2. crawl_results (sin project_id → vía audits) ─────────────────────────────
GRANT SELECT ON crawl_results TO authenticated;
--> statement-breakpoint

ALTER TABLE crawl_results ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "crawl_results_select_member_or_owner" ON crawl_results;
--> statement-breakpoint

CREATE POLICY "crawl_results_select_member_or_owner" ON crawl_results
  FOR SELECT TO authenticated
  USING (
    audit_id IN (
      SELECT a.id FROM audits a
      WHERE a.project_id IN (
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

-- ── 3. keyword_targets ─────────────────────────────────────────────────────────
GRANT SELECT ON keyword_targets TO authenticated;
--> statement-breakpoint

ALTER TABLE keyword_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "keyword_targets_select_member_or_owner" ON keyword_targets;
--> statement-breakpoint

CREATE POLICY "keyword_targets_select_member_or_owner" ON keyword_targets
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

-- ── 4. rank_history (sin project_id → vía keyword_targets) ─────────────────────
GRANT SELECT ON rank_history TO authenticated;
--> statement-breakpoint

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "rank_history_select_member_or_owner" ON rank_history;
--> statement-breakpoint

CREATE POLICY "rank_history_select_member_or_owner" ON rank_history
  FOR SELECT TO authenticated
  USING (
    keyword_id IN (
      SELECT kt.id FROM keyword_targets kt
      WHERE kt.project_id IN (
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

-- ── 5. integration_data_gsc ────────────────────────────────────────────────────
GRANT SELECT ON integration_data_gsc TO authenticated;
--> statement-breakpoint

ALTER TABLE integration_data_gsc ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "integration_data_gsc_select_member_or_owner" ON integration_data_gsc;
--> statement-breakpoint

CREATE POLICY "integration_data_gsc_select_member_or_owner" ON integration_data_gsc
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
