import {
  pgTable, uuid, text, timestamp, integer,
  jsonb, index
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Security Audit Logs ──────────────────────────────────────────────────────
// Eventos de seguridad estructurados: rate limit hits, open redirect attempts,
// CSP violations, auth failures/successes, etc.
// Separada de audit_logs (CRUD de aplicación) porque la estructura es diferente:
// SecurityEvent tiene eventType + metadata, no oldData/newData como audit_logs.
export const securityAuditLogs = pgTable("security_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: text("event_type").notNull(),
  ip: text("ip").notNull().default("unknown"),
  userId: uuid("user_id"),
  path: text("path").notNull().default("/"),
  method: text("method").notNull().default("UNKNOWN"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_sec_audit_event_type_created").on(t.eventType, t.createdAt),
  index("idx_sec_audit_ip_created").on(t.ip, t.createdAt),
  // REC-02 (TSK-008): ILIKE '%…%' sobre ip sin índice GIN trgm → seq scan.
  index("idx_sec_audit_ip_trgm").using("gin", t.ip.op("gin_trgm_ops")),
  // REC-03 (TSK-008): filtro metadata->>'action' en audit-logs.
  index("idx_sec_audit_meta_action").on(sql`(metadata->>'action')`),
]);

// ─── SIEM Alert Logs ──────────────────────────────────────────────────────────
// Historial independiente de alertas enviadas por el SIEM exporter.
// Cada fila representa un intento de envío a un webhook destino específico,
// con estado de la entrega. Separada de security_audit_logs porque:
// - Tiene estructura diferente (target, responseCode, errorMessage)
// - Es generada por el sistema (SIEM), no por eventos de seguridad en requests
// - Permite consultar historial de alertas sin mezclar con events de auditoría
export const siemAlertLogs = pgTable("siem_alert_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleEventType: text("rule_event_type").notNull(),
  ip: text("ip").notNull(),
  severity: text("severity").notNull().default("warning"),
  label: text("label").notNull(),
  count: integer("count").notNull(),
  windowMinutes: integer("window_minutes").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull().default("success"),
  responseCode: integer("response_code"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_siem_logs_created").on(t.createdAt),
  index("idx_siem_logs_severity_created").on(t.severity, t.createdAt),
  index("idx_siem_logs_rule_type_created").on(t.ruleEventType, t.createdAt),
  // REC-04 (TSK-008): ILIKE '%…%' sobre ip en siem-alerts → GIN trgm.
  index("idx_siem_ip_trgm").using("gin", t.ip.op("gin_trgm_ops")),
]);
