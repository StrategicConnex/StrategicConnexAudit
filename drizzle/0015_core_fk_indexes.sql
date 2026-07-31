-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0015: Core FK column indexes
--
-- Las tablas core (SEO/auditoria) tenian constraints FK sin indice en las
-- columnas FK (detectado en la revision de 0000_old_zaladane.sql), causando
-- seq scans en cada join / delete en cascada. Ver docs/improvements/DB_OPTIMIZATION_REPORT.md 3.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_owner
  ON projects USING btree (owner_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_audits_project
  ON audits USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_audits_created_by
  ON audits USING btree (created_by);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_crawl_results_audit
  ON crawl_results USING btree (audit_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_issues_project
  ON issues USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_issues_audit
  ON issues USING btree (audit_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_issues_rule
  ON issues USING btree (rule_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_internal_links_crawl
  ON internal_links USING btree (crawl_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_performance_results_audit
  ON performance_results USING btree (audit_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_report_exports_report
  ON report_exports USING btree (report_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created
  ON audit_logs USING btree (project_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs USING btree (user_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_subscriptions_project
  ON subscriptions USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
  ON subscriptions USING btree (plan_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_backlink_history_backlink
  ON backlink_history USING btree (backlink_id, checked_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_competitor_keywords_competitor
  ON competitor_keywords USING btree (competitor_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_ab_test_results_test
  ON ab_test_results USING btree (test_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_schema_validations_project
  ON schema_validations USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_heatmap_sessions_project
  ON heatmap_sessions USING btree (project_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_uptime_logs_project_checked
  ON uptime_logs USING btree (project_id, checked_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked
  ON uptime_logs USING btree (checked_at);
--> statement-breakpoint
