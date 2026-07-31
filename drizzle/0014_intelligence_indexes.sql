-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0014: Intelligence indexes optimization
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_intel_investigations_project_created
  ON intelligence_investigations USING btree (project_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_investigations_project_status
  ON intelligence_investigations USING btree (project_id, status);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_tool_runs_tool_investigation
  ON intelligence_tool_runs USING btree (tool_id, investigation_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_tool_runs_investigation_created
  ON intelligence_tool_runs USING btree (investigation_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_tool_runs_project_created
  ON intelligence_tool_runs USING btree (project_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_findings_investigation_severity
  ON intelligence_findings USING btree (investigation_id, severity);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_assets_investigation
  ON intelligence_assets USING btree (investigation_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_run_events_investigation_created
  ON intelligence_run_events USING btree (investigation_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_findings_investigation_created
  ON intelligence_findings USING btree (investigation_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_intel_assets_project_last_seen
  ON intelligence_assets USING btree (project_id, last_seen_at);
--> statement-breakpoint
