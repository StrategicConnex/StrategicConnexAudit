-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0019: Supabase/Postgres best-practices — missing index gaps
--
-- CONTEXTO: auditoría de la capa de BD contra el skill supabase-postgres-
-- best-practices (query-missing-indexes CRITICAL, security-rls-performance
-- HIGH). Se detectaron columnas WHERE/JOIN y columnas de hot path SIN índice,
-- causando seq scans en tablas de alto volumen y en cada request autenticado.
--
-- Hallazgos corregidos (todos idempotentes vía IF NOT EXISTS):
--   1. web_vitals_logs (RUM, alto volumen) — sin índice alguno; las queries
--      del dashboard filtran por (project_id, recorded_at).   <- CRITICAL
--   2. developer_api_keys.hashed_key — lookup por hash en CADA request de la
--      API pública (api-auth.ts) sin índice único -> seq scan por request. <- CRITICAL
--   3. project_members.user_id — las policies RLS (0016) hacen subquery
--      `pm.user_id = sub`; el unique (project_id, user_id) NO cubre user_id. <- CRITICAL
--   4. intelligence_usage_events (quota metering) — sin índice en project/user.
--   5. domain_technologies.project_id — FK sin índice.
--   6. ab_tests.project_id / reports.project_id / reports.created_by —
--      FKs del core sin índice.
--   7. integration_sync_logs.integration_id — FK sin índice.
--   8. monitoring_alerts — orderBy createdAt desc sin índice de cobertura.
--   9. monitoring_schedules.next_run_at — el cron consulta schedules por
--      nextRunAt; solo existe índice por project_id.
--  10. team_audit_logs.project_id / project_invitations.invited_by — FKs sin índice.
--
-- Los índices se declaran TAMBIÉN en los schemas Drizzle (fuente única) para
-- que drizzle-kit push/generate no los considere drift.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. CRITICAL: web_vitals_logs (RUM) — dashboard filtra por project + time range
CREATE INDEX IF NOT EXISTS idx_web_vitals_project_recorded
  ON web_vitals_logs USING btree (project_id, recorded_at);
--> statement-breakpoint

-- 2. CRITICAL: developer_api_keys — lookup por hash en el auth path de la API
CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_api_keys_hashed
  ON developer_api_keys USING btree (hashed_key);
--> statement-breakpoint

-- 3. CRITICAL: project_members — las policies RLS subquery por user_id
CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members USING btree (user_id);
--> statement-breakpoint

-- 4. intelligence_usage_events — quota metering por project/user + ventana temporal
CREATE INDEX IF NOT EXISTS idx_intel_usage_project_created
  ON intelligence_usage_events USING btree (project_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_usage_user
  ON intelligence_usage_events USING btree (user_id);
--> statement-breakpoint

-- 5. domain_technologies — FK project_id (cada scan de discovery JOINea esta tabla)
CREATE INDEX IF NOT EXISTS idx_domain_technologies_project
  ON domain_technologies USING btree (project_id);
--> statement-breakpoint

-- 6. FKs del core sin índice
CREATE INDEX IF NOT EXISTS idx_ab_tests_project
  ON ab_tests USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_reports_project
  ON reports USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_reports_created_by
  ON reports USING btree (created_by);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_integration
  ON integration_sync_logs USING btree (integration_id);
--> statement-breakpoint

-- 7. monitoring_alerts — el endpoint ordena por created_at desc
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_project_created
  ON monitoring_alerts USING btree (project_id, created_at);
--> statement-breakpoint

-- 8. monitoring_schedules — el cron de uptime selecciona por next_run_at
CREATE INDEX IF NOT EXISTS idx_monitoring_schedules_next_run
  ON monitoring_schedules USING btree (next_run_at);
--> statement-breakpoint

-- 9. FKs restantes de teams/auditoría
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_project
  ON team_audit_logs USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_project_invitations_invited_by
  ON project_invitations USING btree (invited_by);
--> statement-breakpoint
