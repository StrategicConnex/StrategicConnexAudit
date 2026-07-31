-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0016: RLS policies para tablas de monitoreo y anomalías
--
-- CONTEXTO: la verificación de pg_policies mostró que RLS estaba DESHABILITADO
-- en todas las tablas y no existían policies. El helper withRLS() de la app
-- (src/shared/db/rls.ts) establece request.jwt.claims {sub: userId} + SET ROLE
-- authenticated, pero sin policies ni grants los endpoints con withRLS:
--   a) no aíslan datos entre tenants (RLS off = todo visible)  ← FUGA
--   b) fallan con 42501 si authenticated no tiene grants       ← 500 fail-closed
--
-- Esta migración corrige uptime_logs y anomaly_detections (las 2 tablas usadas
-- por los endpoints que se migraron a withRLS en el turno previo: benchmarking,
-- intelligence/live y intelligence/anomalies). Las policies verifican membresía
-- real del usuario (dueño del proyecto O miembro de project_members).
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Grants: el rol authenticated necesita SELECT a nivel tabla.
--    project_members se incluye porque las policies hacen subquery de membresía.
GRANT SELECT ON uptime_logs TO authenticated;
--> statement-breakpoint

GRANT SELECT ON anomaly_detections TO authenticated;
--> statement-breakpoint

GRANT SELECT ON project_members TO authenticated;
--> statement-breakpoint

-- 2. Habilitar RLS en las tablas
ALTER TABLE uptime_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. Policies SELECT — el usuario ve filas solo de proyectos donde es owner o member.
--    El sub del usuario viene de current_setting('request.jwt.claims') que establece withRLS().
--    DROP POLICY IF EXISTS hace la migración idempotente (re-ejecutable).
DROP POLICY IF EXISTS "uptime_logs_select_member_or_owner" ON uptime_logs;
--> statement-breakpoint

CREATE POLICY "uptime_logs_select_member_or_owner" ON uptime_logs
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

DROP POLICY IF EXISTS "anomaly_detections_select_member_or_owner" ON anomaly_detections;
--> statement-breakpoint

CREATE POLICY "anomaly_detections_select_member_or_owner" ON anomaly_detections
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

-- 4. RLS en project_members: el grant SELECT otorgado arriba solo debe exponer
--    la membresía del propio usuario, no la de todos los proyectos (metadata leak).
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "project_members_select_own" ON project_members;
--> statement-breakpoint

CREATE POLICY "project_members_select_own" ON project_members
  FOR SELECT TO authenticated
  USING (
    user_id = (NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid
  );
--> statement-breakpoint
