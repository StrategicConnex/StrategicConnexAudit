-- TD-29 (2026-11-01): completa el modelo RLS de tenant para la capa de
-- inteligencia/auditorías y otorga a los roles de plataforma los permisos que
-- Supabase aprovisiona por defecto pero que un Postgres vanilla (el job
-- `integration` de CI) no tiene.
--
-- GAP 1 — Policies faltantes (con withRLS estos writes fallaban con 42501):
--   * audits: solo existían SELECT (0024) e INSERT (0052). Faltan UPDATE/DELETE.
--   * intelligence_findings: SELECT (0022) e INSERT (0023) y UPDATE (0046).
--     Falta DELETE.
--   El patrón de acesso es owner-only: reutiliza user_has_project_access()
--   (0025, reescrita owner-only por 0052 tras dropear project_members).
--
-- GAP 2 — Grants de plataforma. Los roles anon/authenticated/service_role
-- los crea scripts/db/prepare-test.mjs (TD-19), pero NINGUNA migración les
-- había garantizado USAGE del schema public ni derechos DML sobre users y
-- projects; para audits/findings el cubrimiento estaba parcial. En Supabase
-- estos GRANTs vienen de fábrica; aquí los fija/idempotiza la migración.
--
-- Idempotente: CREATE POLICY no admite IF NOT EXISTS → DROP previo (convención
-- 0025/0052). GRANT es idempotente por naturaleza. No se modifica el esquema.

-- ─── Grants de plataforma ────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated, service_role;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated, service_role;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON audits TO authenticated, service_role;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON intelligence_findings TO authenticated, service_role;
--> statement-breakpoint

-- ─── audits: UPDATE/DELETE owner-only ────────────────────────────────────────
DROP POLICY IF EXISTS "audits_update_owner" ON audits;
--> statement-breakpoint

CREATE POLICY "audits_update_owner" ON audits
  FOR UPDATE TO authenticated
  USING (public.user_has_project_access(project_id))
  WITH CHECK (public.user_has_project_access(project_id));
--> statement-breakpoint

DROP POLICY IF EXISTS "audits_delete_owner" ON audits;
--> statement-breakpoint

CREATE POLICY "audits_delete_owner" ON audits
  FOR DELETE TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint

-- ─── intelligence_findings: DELETE owner-only ─────────────────────────────────
DROP POLICY IF EXISTS "intelligence_findings_delete_owner" ON intelligence_findings;
--> statement-breakpoint

CREATE POLICY "intelligence_findings_delete_owner" ON intelligence_findings
  FOR DELETE TO authenticated
  USING (public.user_has_project_access(project_id));
--> statement-breakpoint
