-- Sprint 6 (Q4 6.3): índices compuestos faltantes (idempotente).
-- CREATE INDEX CONCURRENTLY dentro de migración transaccional NO se permite;
-- las tablas están por debajo del umbral de bloqueo (verificar row_count antes
-- de aplicar en prod — Task 9) y se usan plain CREATE ... IF NOT EXISTS.
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_findings_project_severity_created
  ON intelligence_findings (project_id, severity, created_at DESC);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sec_audit_user_created
  ON security_audit_logs (user_id, created_at DESC);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sec_audit_created
  ON security_audit_logs (created_at);
