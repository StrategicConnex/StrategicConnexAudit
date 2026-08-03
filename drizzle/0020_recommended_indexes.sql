-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0020: REC-01..REC-07 — índices recomendados (TSK-008)
--
-- CONTEXTO: el plan P1 (TSK-008) materializa los 7 candidatos REC-01..REC-07
-- documentados en docs/database/INDEX-STRATEGY.md §3. Cada índice responde a
-- una consulta REAL con evidencia de código:
--
--   REC-01 intelligence_findings(tool_run_id)
--       FK con onDelete SET NULL; borrar un tool_run fuerza seq scan.
--   REC-02 security_audit_logs GIN pg_trgm(ip)
--       ilike('%x%') con comodín inicial — audit-logs/route.ts:36.
--   REC-03 security_audit_logs((metadata->>'action'))
--       filtro metadata->>'action' — audit-logs/route.ts:50-54.
--   REC-04 siem_alert_logs GIN pg_trgm(ip)
--       ilike('%ip%') — siem-alerts/route.ts:39.
--   REC-05 dns_history(project_id, query, record_type, snapshot_date DESC)
--       getDnsRecordHistory — dns-history.ts:122-129.
--   REC-06 whois_history(project_id, domain, snapshot_date DESC)
--       whois-history.ts:110/121 (equality + order DESC limit 2).
--   REC-07 dns_history(project_id, query, snapshot_date DESC)
--       cambios de tipo de registro + diff — dns-history.ts:135-144.
--
-- REC-02/REC-04 requieren la extensión pg_trgm (soportada en Supabase).
-- Todos los CREATE son idempotentes (IF NOT EXISTS). Los índices se declaran
-- TAMBIÉN en los schemas Drizzle (fuente única) para que drizzle-kit
-- push/generate no los considere drift.
--
-- NOTA: no se usa CONCURRENTLY porque las migraciones Drizzle/Trigger.dev se
-- ejecutan en transacciones; para aplicar en vivo con carga usar el SQL de
-- referencia §3.2 de INDEX-STRATEGY.md (CONCURRENTLY) fuera de transacción.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0. Extensión para los índices GIN trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- REC-01: FK tool_run_id (onDelete SET NULL) — borrar un tool_run escanea findings
CREATE INDEX IF NOT EXISTS idx_findings_tool_run
  ON intelligence_findings USING btree (tool_run_id);
--> statement-breakpoint

-- REC-02: ilike('%…%') sobre ip en el filtro de audit-logs
CREATE INDEX IF NOT EXISTS idx_sec_audit_ip_trgm
  ON security_audit_logs USING gin (ip gin_trgm_ops);
--> statement-breakpoint

-- REC-03: filtro metadata->>'action' en audit-logs (índice de expresión)
CREATE INDEX IF NOT EXISTS idx_sec_audit_meta_action
  ON security_audit_logs USING btree ((metadata->>'action'));
--> statement-breakpoint

-- REC-04: ilike('%…%') sobre ip en siem-alerts
CREATE INDEX IF NOT EXISTS idx_siem_ip_trgm
  ON siem_alert_logs USING gin (ip gin_trgm_ops);
--> statement-breakpoint

-- REC-05: equality project+query+recordType, order snapshot_date DESC
CREATE INDEX IF NOT EXISTS idx_dns_proj_query_rtype_date
  ON dns_history USING btree (project_id, query, record_type, snapshot_date DESC);
--> statement-breakpoint

-- REC-06: equality project+domain, order snapshot_date DESC (limit 2)
CREATE INDEX IF NOT EXISTS idx_whois_proj_domain_date
  ON whois_history USING btree (project_id, domain, snapshot_date DESC);
--> statement-breakpoint

-- REC-07: cambios de tipo de registro + diff — project+query por fecha
CREATE INDEX IF NOT EXISTS idx_dns_proj_query_date
  ON dns_history USING btree (project_id, query, snapshot_date DESC);
--> statement-breakpoint
