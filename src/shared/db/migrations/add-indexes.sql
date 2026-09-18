-- Performance indexes for common query patterns
-- Generated: 2026-09-18
-- NOTE: idx_intel_findings_project_severity already exists in Drizzle schema
--       (intelligence.ts:91). Skipping duplicate.

-- Intelligence assets: filter by project and asset type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_project_type
ON intelligence_assets(project_id, asset_type);

-- Audit logs: ordered by creation date for timeline queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at DESC);

-- Audit logs: filter by project
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_project
ON audit_logs(project_id);

-- Keyword targets: filter by project
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_targets_project
ON keyword_targets(project_id);

-- Uptime logs: filter by project and timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uptime_logs_project_timestamp
ON uptime_logs(project_id, checked_at DESC);
