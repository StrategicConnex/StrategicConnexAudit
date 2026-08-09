-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0022: RLS en tablas de inteligencia + publicación realtime (CHANGE-003)
--
-- CONTEXTO: el cliente se suscribe por Supabase Realtime con anon key a 4 tablas
-- (intelligence_findings, intelligence_assets, intelligence_investigations,
-- intelligence_run_events) vía useRealtimeMetrics.ts y useInvestigationRealtime.ts.
-- Estas tablas NO tenían RLS (SB-001/SB-002): un suscriptor con la anon key podía
-- leer filas de otros tenants si la publicación realtime estaba activa.
--
-- Este cambio: grants SELECT → ENABLE RLS → policies member_or_owner (mismo patrón
-- que 0016/0017, subquery de membresía vía projects/project_members) → alta en la
-- publicación supabase_realtime. La policy de run_events (que NO tiene project_id,
-- solo investigation_id) resuelve la membresía por subquery de investigations.
--
-- NOTA: db/directDb se conectan con rol privilegiado y bypasean RLS; este cambio
-- solo gatea el camino Realtime/PostgREST con anon key. (SUPABASE-AUDIT SB-002)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Grants: el rol authenticated necesita SELECT a nivel tabla (mismo patrón 0016).
GRANT SELECT ON intelligence_findings TO authenticated;
--> statement-breakpoint

GRANT SELECT ON intelligence_assets TO authenticated;
--> statement-breakpoint

GRANT SELECT ON intelligence_investigations TO authenticated;
--> statement-breakpoint

GRANT SELECT ON intelligence_run_events TO authenticated;
--> statement-breakpoint

-- 2. Habilitar RLS en las 4 tablas expuestas por Realtime.
ALTER TABLE intelligence_findings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE intelligence_assets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE intelligence_investigations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE intelligence_run_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 3. Policies SELECT member_or_owner — el usuario ve filas solo de proyectos donde
--    es owner o miembro (patrón idéntico a 0016/0017). El sub viene de
--    current_setting('request.jwt.claims') que establece withRLS()/Realtime.
--    DROP POLICY IF EXISTS hace la migración idempotente (re-ejecutable).

DROP POLICY IF EXISTS "intelligence_findings_select_member_or_owner" ON intelligence_findings;
--> statement-breakpoint

CREATE POLICY "intelligence_findings_select_member_or_owner" ON intelligence_findings
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

DROP POLICY IF EXISTS "intelligence_assets_select_member_or_owner" ON intelligence_assets;
--> statement-breakpoint

CREATE POLICY "intelligence_assets_select_member_or_owner" ON intelligence_assets
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

DROP POLICY IF EXISTS "intelligence_investigations_select_member_or_owner" ON intelligence_investigations;
--> statement-breakpoint

CREATE POLICY "intelligence_investigations_select_member_or_owner" ON intelligence_investigations
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

-- run_events NO tiene project_id (solo investigation_id) → membresía vía
-- subquery de intelligence_investigations (verificado en el schema 0022).
DROP POLICY IF EXISTS "intelligence_run_events_select_member_or_owner" ON intelligence_run_events;
--> statement-breakpoint

CREATE POLICY "intelligence_run_events_select_member_or_owner" ON intelligence_run_events
  FOR SELECT TO authenticated
  USING (
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

-- 4. Publicación realtime — alta idempotente en supabase_realtime (la publicación
--    la crea la plataforma Supabase por defecto). RLS ya está activa ANTES de
--    publicar (orden crítico: sin RLS la publicación expondría todas las filas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN ('intelligence_findings','intelligence_assets','intelligence_investigations','intelligence_run_events')
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      public.intelligence_findings,
      public.intelligence_assets,
      public.intelligence_investigations,
      public.intelligence_run_events;
  END IF;
END $$;
--> statement-breakpoint
