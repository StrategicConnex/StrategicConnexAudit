/**
 * Types for Security Audit module
 */

export type SecurityEventType =
  | "rate_limit_hit"
  | "open_redirect_attempt"
  | "csp_violation"
  | "auth_failure"
  | "auth_success"
  | "rate_limit_bypass"
  | "invalid_input";

export interface AuditLogEntry {
  id: string;
  eventType: SecurityEventType;
  ip: string;
  userId: string | null;
  path: string;
  method: string;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApiResponse {
  success: boolean;
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
  eventTypes: string[];
  error?: string;
}

export interface SiemAlertEntry {
  id: string;
  ruleEventType: string;
  ip: string;
  severity: string;
  label: string;
  count: number;
  windowMinutes: number;
  target: string;
  status: "success" | "failed";
  responseCode: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  detectedAt: string;
  createdAt: string;
}

export interface SiemAlertsApiResponse {
  success: boolean;
  alerts: SiemAlertEntry[];
  total: number;
  limit: number;
  offset: number;
  ruleTypes: string[];
  severities: string[];
  breakdown: { success: number; failed: number };
  error?: string;
}

export interface TestWebhookDetail {
  target: string;
  status: number;
  ok: boolean;
  durationMs: number;
}

export interface TestWebhookResponse {
  success: boolean;
  results: TestWebhookDetail[];
  total: number;
  passed: number;
}

export interface WhoisChangeMetadata {
  domain: string;
  previous: Record<string, string>;
  current: Record<string, string>;
  changedFields: string[];
}

export interface DnsChangeMetadata {
  domain: string;
  changeType: string;
  previous: string[];
  current: string[];
}

export type Tab = "events" | "siem" | "whois" | "dns";
