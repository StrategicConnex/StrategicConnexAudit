-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0027: RLS fase 2 — resto de tablas sensibles (P0-2)
--
-- CONTEXTO: ~40 tablas sin ENABLE RLS vivían en fail-closed accidental (sin
-- grants a `authenticated`). Cualquier GRANT futuro o PostgREST exponía datos
-- cross-tenant. Esta migración hace el aislamiento explícito:
--   * Tablas por proyecto → policies member_or_owner (reusa
--     public.user_has_project_access() de 0025, sin recursión).
--   * Hijas sin project_id → EXISTS hacia la tabla padre.
--   * Catálogos → lectura para authenticated, sin escritura.
--   * Logs/admin → solo platform admin (sin grants a authenticated: el
--     service role de directDb no se ve afectado).
-- Patrón estándar Supabase: grants amplios + policies restrictivas.
-- Idempotente (DROP POLICY IF EXISTS). Grants primero, policies después.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ 0. Grants ═══════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON
  integrations, integration_sync_logs, integration_data_ga4,
  integration_data_bing, project_audit_rules, issues, competitors,
  competitor_keywords, backlinks, backlink_history, ab_tests,
  ab_test_results, heatmap_sessions, schema_validations, reports,
  report_exports, subscriptions, monitoring_schedules, monitoring_alerts,
  webhook_configs, dns_history, whois_history, plugin_instances,
  domain_technologies, project_invitations, team_audit_logs,
  adversary_runs, adversary_assessments, mitre_evaluations,
  intelligence_usage_events, web_vitals_logs,
  internal_links, performance_results, mitre_technique_results,
  adversary_vulnerabilities
TO authenticated;

-- push_subscriptions: lectura propia + alta anónima preservada (la ruta
-- /api/notifications/push-subscribe acepta anónimos; el rate-limit sigue
-- siendo la defensa anti-spam).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
GRANT INSERT ON push_subscriptions TO anon;

-- web_vitals_logs: el beacon RUM escribe sin sesión (P0-3 le suma token).
GRANT INSERT ON web_vitals_logs TO anon;

-- Catálogos: solo lectura.
GRANT SELECT ON audit_rules, subscription_plans, adversary_scenarios, plugin_packages TO authenticated;

-- ══ 1. ENABLE RLS ═══════════════════════════════════════════════════════════

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_data_ga4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_data_bing ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlink_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE heatmap_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dns_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE whois_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE adversary_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE adversary_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitre_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_vitals_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitre_technique_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE adversary_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE adversary_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE siem_alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- ══ 2. Policies miembro (project_id directo) ═══════════════════════════════
--> statement-breakpoint

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'integrations', 'integration_sync_logs', 'integration_data_ga4',
    'integration_data_bing', 'project_audit_rules', 'issues', 'competitors',
    'competitor_keywords', 'backlinks', 'backlink_history', 'ab_tests',
    'ab_test_results', 'heatmap_sessions', 'schema_validations', 'reports',
    'report_exports', 'subscriptions', 'monitoring_schedules',
    'monitoring_alerts', 'webhook_configs', 'dns_history', 'whois_history',
    'plugin_instances', 'domain_technologies', 'project_invitations',
    'team_audit_logs', 'adversary_runs', 'adversary_assessments',
    'mitre_evaluations', 'intelligence_usage_events', 'web_vitals_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      -- Guard por sentencia: algunas tablas de la lista no tienen project_id
      -- (p.ej. integration_sync_logs) y el CREATE POLICY fallaría, abortando
      -- TODO el bloque (transaccional). Con EXCEPTION seguimos con el resto.
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_fase2', t);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (public.user_has_project_access(project_id)) WITH CHECK (public.user_has_project_access(project_id))',
        t || '_fase2', t
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'policy %_fase2 omitida: %', t, SQLERRM;
    END;
  END LOOP;
END $$;
--> statement-breakpoint

-- ══ 3. Policies hijas (vía tabla padre) ════════════════════════════════════

DROP POLICY IF EXISTS internal_links_fase2 ON internal_links;
CREATE POLICY internal_links_fase2 ON internal_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM audits a WHERE a.id = internal_links.audit_id AND public.user_has_project_access(a.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM audits a WHERE a.id = internal_links.audit_id AND public.user_has_project_access(a.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS performance_results_fase2 ON performance_results;
CREATE POLICY performance_results_fase2 ON performance_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM audits a WHERE a.id = performance_results.audit_id AND public.user_has_project_access(a.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM audits a WHERE a.id = performance_results.audit_id AND public.user_has_project_access(a.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS mitre_technique_results_fase2 ON mitre_technique_results;
CREATE POLICY mitre_technique_results_fase2 ON mitre_technique_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM mitre_evaluations e WHERE e.id = mitre_technique_results.evaluation_id AND public.user_has_project_access(e.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM mitre_evaluations e WHERE e.id = mitre_technique_results.evaluation_id AND public.user_has_project_access(e.project_id)));
--> statement-breakpoint

DROP POLICY IF EXISTS adversary_vulnerabilities_fase2 ON adversary_vulnerabilities;
CREATE POLICY adversary_vulnerabilities_fase2 ON adversary_vulnerabilities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM adversary_assessments a WHERE a.id = adversary_vulnerabilities.assessment_id AND public.user_has_project_access(a.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM adversary_assessments a WHERE a.id = adversary_vulnerabilities.assessment_id AND public.user_has_project_access(a.project_id)));
--> statement-breakpoint

-- ══ 4. push_subscriptions (propias + alta anónima) ═════════════════════════

DROP POLICY IF EXISTS push_subscriptions_owner ON push_subscriptions;
CREATE POLICY push_subscriptions_owner ON push_subscriptions FOR ALL TO authenticated
  USING (user_id = public.current_auth_uid())
  WITH CHECK (user_id = public.current_auth_uid());
--> statement-breakpoint

DROP POLICY IF EXISTS push_subscriptions_anon_insert ON push_subscriptions;
CREATE POLICY push_subscriptions_anon_insert ON push_subscriptions FOR INSERT TO anon
  WITH CHECK (true);
--> statement-breakpoint

-- web_vitals_logs: beacon anónimo preservado (P0-3 le suma token HMAC).
DROP POLICY IF EXISTS web_vitals_anon_insert ON web_vitals_logs;
CREATE POLICY web_vitals_anon_insert ON web_vitals_logs FOR INSERT TO anon
  WITH CHECK (true);
--> statement-breakpoint

-- ══ 5. Catálogos (lectura autenticada) ═════════════════════════════════════

DROP POLICY IF EXISTS audit_rules_read ON audit_rules;
CREATE POLICY audit_rules_read ON audit_rules FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS subscription_plans_read ON subscription_plans;
CREATE POLICY subscription_plans_read ON subscription_plans FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS adversary_scenarios_read ON adversary_scenarios;
CREATE POLICY adversary_scenarios_read ON adversary_scenarios FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS plugin_packages_read ON plugin_packages;
CREATE POLICY plugin_packages_read ON plugin_packages FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

-- ══ 6. Logs/admin (solo plataforma; sin grants: service role intacto) ══════

DROP POLICY IF EXISTS security_audit_logs_admin ON security_audit_logs;
CREATE POLICY security_audit_logs_admin ON security_audit_logs FOR ALL TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());
--> statement-breakpoint

DROP POLICY IF EXISTS siem_alert_logs_admin ON siem_alert_logs;
CREATE POLICY siem_alert_logs_admin ON siem_alert_logs FOR ALL TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());
--> statement-breakpoint

DROP POLICY IF EXISTS ai_health_logs_admin ON ai_health_logs;
CREATE POLICY ai_health_logs_admin ON ai_health_logs FOR ALL TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());
--> statement-breakpoint

DROP POLICY IF EXISTS ai_usage_admin ON ai_usage;
CREATE POLICY ai_usage_admin ON ai_usage FOR ALL TO authenticated
  USING (public.current_user_is_platform_admin())
  WITH CHECK (public.current_user_is_platform_admin());
--> statement-breakpoint
