-- 0050 — Restituir los índices que las migraciones declaran y la BD de producción
-- nunca tuvo (incluye 42 columnas FK sin índice cubridor).
--
-- HALLAZGO (2026-10-14). Medido contra la BD real con `pg_constraint`/`pg_index`
-- (JOIN sobre `pg_index.indkey` comparando el prefijo del índice con `conkey`):
--   · 93 constraints FK en `public`; **42 columnas FK sin ningún índice que las
--     lidere**. Borrar un padre o hacer JOIN sobre la FK fuerza un seq scan, y el
--     caso medido más caro — `uptime_logs` — lee la tabla completa para devolver
--     las últimas 10 filas de un proyecto.
--   · 32 de esos huecos corresponden a índices que YA estaban escritos en las
--     migraciones `0012`, `0015` y `0019` pero que NO existen en la BD
--     (`CREATE INDEX IF NOT EXISTS` en un ledger que dice "aplicado").
--     `idx_uptime_logs_project_checked`, `idx_audit_logs_project_created`,
--     `idx_reports_project`, `idx_web_vitals_project_recorded`,
--     `idx_intel_usage_*`, … todas ausentes. Reejecutar su DDL es el fix.
--   · las 15 columnas FK restantes nunca tuvieron índice declarado en ningún
--     sitio: aquí se crean por primera vez (ver bloque 2).
--
-- DEFECTO RAÍZ que esto destapa: `scripts/db/drift-check.mjs` compara tablas,
-- columnas, nullability y defaults, pero **no índices**. Un índice declarado y
-- ausente (o al revés) nunca puso el pipeline en rojo, así que la brecha creció
-- en silencio. El guard de índices es trabajo aparte (P1); esta migración sólo
-- cierra el estado actual.
--
-- SECUENCIA DE APLICACIÓN. Igual que el resto de migraciones con DDL de índices
-- del repo, **no** se usa `CONCURRENTLY`: drizzle-kit ejecuta cada migración
-- dentro de una transacción y `CREATE INDEX CONCURRENTLY` no puede correr
-- dentro de una. Las tablas afectadas son pequeñas (ninguna supera las ~21k
-- filas), así que el bloqueo de escritura es de milisegundos. Para reaplicar a
-- mano con carga viva, extraer los statements y correrlos fuera de transacción.
--
-- IDEMPOTENTE: `IF NOT EXISTS` en cada statement. Reejecutarla es no-op.
-- Nombres: se conservan los de las migraciones históricas donde existen; para
-- los nuevos se sigue la convención `idx_<tabla>_<columna>`.

-- ═══ 1. Índices declarados en 0012/0015/0019 y ausentes en la BD (32) ═══════

-- ── 0015_core_fk_indexes.sql (21: 20 FK + 1 rango temporal) ────────────────
CREATE INDEX IF NOT EXISTS idx_projects_owner
  ON public.projects USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_audits_project
  ON public.audits USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_by
  ON public.audits USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_crawl_results_audit
  ON public.crawl_results USING btree (audit_id);
CREATE INDEX IF NOT EXISTS idx_issues_project
  ON public.issues USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_issues_audit
  ON public.issues USING btree (audit_id);
CREATE INDEX IF NOT EXISTS idx_issues_rule
  ON public.issues USING btree (rule_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_crawl
  ON public.internal_links USING btree (crawl_id);
CREATE INDEX IF NOT EXISTS idx_performance_results_audit
  ON public.performance_results USING btree (audit_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_report
  ON public.report_exports USING btree (report_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created
  ON public.audit_logs USING btree (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON public.audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_project
  ON public.subscriptions USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
  ON public.subscriptions USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_backlink_history_backlink
  ON public.backlink_history USING btree (backlink_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_competitor_keywords_competitor
  ON public.competitor_keywords USING btree (competitor_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_test
  ON public.ab_test_results USING btree (test_id);
CREATE INDEX IF NOT EXISTS idx_schema_validations_project
  ON public.schema_validations USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_sessions_project
  ON public.heatmap_sessions USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_uptime_logs_project_checked
  ON public.uptime_logs USING btree (project_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked
  ON public.uptime_logs USING btree (checked_at);

-- ── 0019_supabase_best_practices_indexes.sql (10) ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_web_vitals_project_recorded
  ON public.web_vitals_logs USING btree (project_id, recorded_at);
-- Faltante aun siendo UNIQUE: `developer_api_keys` está vacía (0 filas), así que
-- la creación no puede fallar por duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_api_keys_hashed
  ON public.developer_api_keys USING btree (hashed_key);
CREATE INDEX IF NOT EXISTS idx_intel_usage_project_created
  ON public.intelligence_usage_events USING btree (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intel_usage_user
  ON public.intelligence_usage_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_project
  ON public.ab_tests USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_reports_project
  ON public.reports USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_by
  ON public.reports USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_integration
  ON public.integration_sync_logs USING btree (integration_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_project_created
  ON public.monitoring_alerts USING btree (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_schedules_next_run
  ON public.monitoring_schedules USING btree (next_run_at);

-- ── 0012_adversary_scenarios.sql (1) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_adversary_mitre_id
  ON public.adversary_scenarios USING btree (mitre_id);

-- ═══ 2. Columnas FK que nunca tuvieron índice declarado (15) ══════════════
-- Cada una es un FK (`ON DELETE SET NULL` en casi todos) cuyo padre, al
-- borrarse, disparaba un seq scan sobre la tabla hija para aplicar la acción.

CREATE INDEX IF NOT EXISTS idx_adv_engagements_owner
  ON public.adversary_engagements USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_adversary_runs_investigation
  ON public.adversary_runs USING btree (investigation_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_investigation
  ON public.anomaly_detections USING btree (investigation_id);
CREATE INDEX IF NOT EXISTS idx_dns_history_investigation
  ON public.dns_history USING btree (investigation_id);
CREATE INDEX IF NOT EXISTS idx_finding_activity_actor
  ON public.finding_activity USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_intel_findings_assignee
  ON public.intelligence_findings USING btree (assignee_id);
CREATE INDEX IF NOT EXISTS idx_intel_investigations_owner
  ON public.intelligence_investigations USING btree (owner_id);
CREATE INDEX IF NOT EXISTS idx_intel_run_events_tool_run
  ON public.intelligence_run_events USING btree (tool_run_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_schedule
  ON public.monitoring_alerts USING btree (schedule_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project
  ON public.notifications USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_plugin_instances_project
  ON public.plugin_instances USING btree (project_id);
CREATE INDEX IF NOT EXISTS idx_project_audit_rules_rule
  ON public.project_audit_rules USING btree (rule_id);
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_actor
  ON public.team_audit_logs USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_users_plan
  ON public.users USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_whois_history_investigation
  ON public.whois_history USING btree (investigation_id);
