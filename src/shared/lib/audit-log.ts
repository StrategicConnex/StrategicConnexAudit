/* ═══════════════════════════════════════════════════════════════════════════
   Audit Log — Structured Security Event Logger
   
   Fail-safe structured logging for security events:
   rate limiting, open redirect, CSP violations, authentication.
   
   Output: structured JSON to stdout + persistencia en Supabase.
   ═══════════════════════════════════════════════════════════════════════════ */

import { directDb } from "@/shared/db";
import { securityAuditLogs } from "@/shared/db/schemas";

const IP_BLOCKLIST = new Set([
  "127.0.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0", "::", "localhost",
]);

export type SecurityEventType =
  | "rate_limit_hit"
  | "open_redirect_attempt"
  | "csp_violation"
  | "auth_failure"
  | "auth_success"
  | "rate_limit_bypass"
  | "invalid_input"
  | "ai_model_health";

export interface SecurityEvent {
  audit: true;
  timestamp: string;
  eventType: SecurityEventType;
  ip: string;
  userId?: string;
  path: string;
  method: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}

/**
 * Registra un evento de seguridad estructurado.
 * Fail-safe: nunca lanza excepciones, nunca bloquea.
 */
export function logSecurityEvent(
  eventType: SecurityEventType,
  details: {
    ip?: string;
    userId?: string;
    path?: string;
    method?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  try {
    const event: SecurityEvent = {
      audit: true,
      timestamp: new Date().toISOString(),
      eventType,
      ip: details.ip || "unknown",
      path: details.path || "/",
      method: details.method || "UNKNOWN",
      userAgent: details.userAgent,
      userId: details.userId,
      metadata: details.metadata || {},
    };
    console.log(JSON.stringify(event));
    persistEvent(event).catch(() => {});
  } catch {
    // Fail-safe
  }
}

/** Extrae IP de headers, filtrando IPs de loopback. */
export function extractIpFromHeaders(headers: Headers | null | undefined): string {
  if (!headers) return "unknown";
  try {
    const v = headers.get("x-vercel-forwarded-for");
    if (v && !IP_BLOCKLIST.has(v)) return v;
    const r = headers.get("x-real-ip");
    if (r && !IP_BLOCKLIST.has(r)) return r;
    const f = headers.get("x-forwarded-for");
    if (f) {
      const ip = f.split(",")[0]?.trim();
      if (ip && !IP_BLOCKLIST.has(ip)) return ip;
    }
  } catch { /* fail-safe */ }
  return "unknown";
}

/** Construye contexto desde un objeto Request-like */
export function eventFromRequest(
  req: { headers?: Headers; url?: string; method?: string } | null | undefined
): { ip: string; path: string; method: string; userAgent: string | undefined } {
  if (!req) return { ip: "unknown", path: "/", method: "UNKNOWN", userAgent: undefined };
  return {
    ip: extractIpFromHeaders(req.headers || null),
    path: req.url ? (() => { try { return new URL(req.url).pathname; } catch { return req.url.startsWith("/") ? req.url : `/${req.url}`; } })() : "/",
    method: req.method || "UNKNOWN",
    userAgent: req.headers?.get("user-agent") || undefined,
  };
}

/** Persiste el evento de seguridad en Supabase (fire-and-forget).
 *  Usa directDb para bypass de RLS: los eventos de seguridad pueden
 *  ocurrir antes de la autenticación o desde fuentes no autenticadas
 *  (CSP reports de navegadores, rate limit hits anónimos).
 *  Fail-safe: nunca lanza — el catch interno lo traga todo. */
async function persistEvent(event: SecurityEvent): Promise<void> {
  try {
    await directDb.insert(securityAuditLogs).values({
      eventType: event.eventType,
      ip: event.ip,
      userId: event.userId || null,
      path: event.path,
      method: event.method,
      userAgent: event.userAgent || null,
      metadata: event.metadata,
    });
  } catch (err) {
    // Fail-safe: no queremos que un fallo de BD interrumpa la request
    console.error("[audit-log] persistEvent falló:", err instanceof Error ? err.message : err);
  }
}
