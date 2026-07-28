/* ═══════════════════════════════════════════════════════════════════════════
   SIEM Exporter — Security Audit Log Forwarder
   
   Lee los security_audit_logs, detecta patrones sospechosos (múltiples
   open_redirect_attempt desde una misma IP en pocos minutos), y envía
   alertas estructuradas a webhooks externos (Slack, PagerDuty, Splunk).
   
   Uso:
     import { runSiemExport } from "@/server/security/siem-exporter";
     await runSiemExport();
   
   Las URLs de los webhooks se configuran vía variables de entorno:
     SIEM_WEBHOOK_SLACK     = https://hooks.slack.com/services/...
     SIEM_WEBHOOK_PAGERDUTY = https://events.pagerduty.com/v2/...
     SIEM_WEBHOOK_SPLUNK    = https://http-inputs-mysplunk.splunkcloud.com/...
   ═══════════════════════════════════════════════════════════════════════════ */

import { gte, eq, and, sql, desc } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { securityAuditLogs, siemAlertLogs } from "@/shared/db/schemas";
import { logSecurityEvent } from "@/shared/lib/audit-log";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiemPattern {
  eventType: string;
  ip: string;
  count: number;
  windowMinutes: number;
  severity: "critical" | "warning" | "info";
  label: string;
  firstSeen: Date;
  lastSeen: Date;
  paths: string[];
  methods: string[];
  metadataSamples: Record<string, unknown>[];
}

export interface SiemHeartbeatInfo {
  sent: boolean;
  reason: string; // "due" | "skipped_recent" | "no_webhooks" | "error"
  lastHeartbeatAgoMinutes: number | null;
}

export interface SiemResult {
  scannedWindowMinutes: number;
  patternsDetected: SiemPattern[];
  heartbeat: SiemHeartbeatInfo;
  alertsSent: number;
  alertsFailed: number;
  errors: string[];
}

// Raw group from DB query — before samples are attached
interface RawGroup {
  eventType: string;
  ip: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

// ─── Configuración ────────────────────────────────────────────────────────────

interface Rule {
  eventType: string;
  threshold: number;
  windowMinutes: number;
  severity: "critical" | "warning" | "info";
  label: string;
}

const RULES: Rule[] = [
  { eventType: "open_redirect_attempt", threshold: 3,  windowMinutes: 5,  severity: "critical", label: "\uD83D\uDEA8 Open Redirect Attack" },
  { eventType: "rate_limit_bypass",     threshold: 1,  windowMinutes: 5,  severity: "critical", label: "\uD83D\uDEA8 Rate Limit Bypass" },
  { eventType: "ai_model_health",       threshold: 1,  windowMinutes: 5,  severity: "critical", label: "\uD83D\uDEA8 AI Model Failure" },
  { eventType: "rate_limit_hit",        threshold: 20, windowMinutes: 5,  severity: "warning",  label: "\u26A0\uFE0F Rate Limit Spike" },
  { eventType: "csp_violation",         threshold: 10, windowMinutes: 10, severity: "warning",  label: "\u26A0\uFE0F CSP Violation Spike" },
  { eventType: "auth_failure",          threshold: 5,  windowMinutes: 5,  severity: "warning",  label: "\u26A0\uFE0F Auth Failure Burst" },
  { eventType: "invalid_input",         threshold: 10, windowMinutes: 5,  severity: "info",     label: "\u2139\uFE0F Invalid Input Spike" },
];

// ─── 1. Query aggregated groups per unique window ──────────────────────────

/** Query aggregated (eventType, ip) counts since `since`.
 *  Returns groups ordered by count desc, with first/last seen timestamps. */
async function queryAggregated(since: Date): Promise<RawGroup[]> {
  return await directDb
    .select({
      eventType: securityAuditLogs.eventType,
      ip: securityAuditLogs.ip,
      count: sql<number>`count(*)`,
      firstSeen: sql<Date>`min(${securityAuditLogs.createdAt})`,
      lastSeen: sql<Date>`max(${securityAuditLogs.createdAt})`,
    })
    .from(securityAuditLogs)
    .where(gte(securityAuditLogs.createdAt, since))
    .groupBy(securityAuditLogs.eventType, securityAuditLogs.ip)
    .orderBy(sql`count(*) desc`);
}

// ─── 2. Pattern detection (in-memory, per rule's own window) ───────────────

/** Agrupa rules por windowMinutes y ejecuta una query agregada por cada
 *  ventana única. Esto evita que rules con window 5min usen counts de 10min.
 *  Solo 2 queries como máximo (5min y 10min), no N+1. */
async function detectMatchingPatterns(): Promise<Array<RawGroup & { rule: Rule }>> {
  // Group unique windows: { 5: [rate_limit_hit, ...], 10: [csp_violation] }
  const rulesByWindow = new Map<number, Rule[]>();
  for (const rule of RULES) {
    const arr = rulesByWindow.get(rule.windowMinutes) || [];
    arr.push(rule);
    rulesByWindow.set(rule.windowMinutes, arr);
  }

  const matched: Array<RawGroup & { rule: Rule }> = [];

  for (const [windowMinutes, rules] of rulesByWindow) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const groups = await queryAggregated(since);

    for (const group of groups) {
      for (const rule of rules) {
        if (group.eventType === rule.eventType && group.count >= rule.threshold) {
          matched.push({ ...group, rule });
          break;
        }
      }
    }
  }

  return matched;
}

// ─── 3. Fetch samples only for matching patterns ──────────────────────────

async function attachSamples(matched: Array<RawGroup & { rule: Rule }>): Promise<SiemPattern[]> {
  const patterns: SiemPattern[] = [];

  for (const m of matched) {
    // Use the rule's own window for sample fetching
    const since = new Date(Date.now() - m.rule.windowMinutes * 60_000);

    const samples = await directDb
      .select({
        path: securityAuditLogs.path,
        method: securityAuditLogs.method,
        metadata: securityAuditLogs.metadata,
      })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.eventType, m.eventType),
          eq(securityAuditLogs.ip, m.ip),
          gte(securityAuditLogs.createdAt, since),
        ),
      )
      .limit(10);

    patterns.push({
      eventType: m.eventType,
      ip: m.ip,
      count: m.count,
      windowMinutes: m.rule.windowMinutes,
      severity: m.rule.severity,
      label: m.rule.label,
      firstSeen: m.firstSeen,
      lastSeen: m.lastSeen,
      paths: [...new Set(samples.map(s => s.path))],
      methods: [...new Set(samples.map(s => s.method))],
      metadataSamples: samples.map(s => (s.metadata ?? {}) as Record<string, unknown>),
    });
  }

  return patterns;
}

// ─── 4. Webhook Formatters ────────────────────────────────────────────────────

interface WebhookPayload {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
}

function formatSlack(pattern: SiemPattern): WebhookPayload {
  const lines = [
    `*${pattern.label}*`,
    `\u2022 *IP:* \`${pattern.ip}\``,
    `\u2022 *Count:* ${pattern.count} en ${pattern.windowMinutes} min`,
    `\u2022 *Window:* ${pattern.firstSeen.toISOString()} \u2192 ${pattern.lastSeen.toISOString()}`,
  ];
  if (pattern.paths.length > 0) {
    lines.push(`\u2022 *Paths:* ${pattern.paths.map(p => `\`${p}\``).join(", ")}`);
  }
  if (pattern.metadataSamples.length > 0) {
    const sample = pattern.metadataSamples[0];
    const extra = Object.entries(sample)
      .filter(([k]) => !["ip", "path", "method"].includes(k))
      .map(([k, v]) => `\u2022 *${k}:* ${typeof v === "object" ? `\`${JSON.stringify(v)}\`` : v}`)
      .join("\n");
    if (extra) lines.push(extra);
  }

  return {
    url: process.env.SIEM_WEBHOOK_SLACK || "",
    body: {
      text: "",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n") },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `\uD83D\uDEE1\uFE0F *SCAUDIT SIEM* \u00B7 ${new Date().toISOString()}` },
          ],
        },
        { type: "divider" },
      ],
    },
  };
}

function formatPagerDuty(pattern: SiemPattern): WebhookPayload {
  return {
    url: process.env.SIEM_WEBHOOK_PAGERDUTY || "",
    headers: { "Content-Type": "application/json" },
    body: {
      routing_key: process.env.SIEM_PAGERDUTY_ROUTING_KEY || "",
      event_action: "trigger",
      dedup_key: `siem_${pattern.eventType}_${pattern.ip}_${pattern.firstSeen.getTime()}`,
      payload: {
        summary: `${pattern.label} \u2014 ${pattern.count} eventos desde ${pattern.ip}`,
        source: pattern.ip,
        severity: pattern.severity,
        timestamp: pattern.lastSeen.toISOString(),
        component: "security-audit",
        group: pattern.eventType,
        class: "security_event",
        custom_details: {
          count: pattern.count,
          windowMinutes: pattern.windowMinutes,
          firstSeen: pattern.firstSeen.toISOString(),
          lastSeen: pattern.lastSeen.toISOString(),
          paths: pattern.paths,
          methods: pattern.methods,
          metadataSamples: pattern.metadataSamples,
        },
      },
    },
  };
}

function formatSplunk(pattern: SiemPattern): WebhookPayload {
  return {
    url: process.env.SIEM_WEBHOOK_SPLUNK || "",
    body: {
      event: "security_alert",
      sourcetype: "scaudit:siem:alert",
      fields: {
        alert_type: pattern.eventType,
        severity: pattern.severity,
        ip: pattern.ip,
        count: pattern.count,
        window_minutes: pattern.windowMinutes,
        first_seen: pattern.firstSeen.toISOString(),
        last_seen: pattern.lastSeen.toISOString(),
        paths: pattern.paths,
        methods: pattern.methods,
        metadata: pattern.metadataSamples,
        source: "SCAUDIT SIEM",
      },
    },
  };
}

// ─── 5. Sender ────────────────────────────────────────────────────────────────

/** Enva notificaciones push del navegador a todos los suscriptores activos.
 *  Se dispara solo cuando el SIEM detecta ai_model_health (modelo de IA caido).
 *  Fire-and-forget: nunca lanza excepciones. */
async function sendPushAlerts(patterns: SiemPattern[]): Promise<void> {
  try {
    // Import una sola vez (Node cachea el mdulo tras el primer import)
    const { sendPushNotificationToAll } = await import("@/server/notifications/push");

    for (const p of patterns) {
      if (p.eventType === "ai_model_health") {
        await sendPushNotificationToAll({
          title: p.label,
          body: `Evento: ${p.eventType} \u2022 IP: ${p.ip} \u2022 ${p.count} ocurrencias en ${p.windowMinutes} min`,
          tag: `siem-${p.eventType}-${p.ip}`,
          url: "/ai/health",
          data: {
            eventType: p.eventType,
            ip: p.ip,
            count: p.count,
            severity: p.severity,
          },
        });
      }
    }
  } catch (err) {
    // Fail-safe: push nunca debe romper el SIEM
    console.error("[siem-exporter] sendPushAlerts fall:", err instanceof Error ? err.message : err);
  }
}

const WEBHOOK_FORMATTERS: Array<{
  envVar: string;
  formatter: (p: SiemPattern) => WebhookPayload;
  name: string;
}> = [
  { envVar: "SIEM_WEBHOOK_SLACK",     formatter: formatSlack,     name: "Slack" },
  { envVar: "SIEM_WEBHOOK_PAGERDUTY", formatter: formatPagerDuty, name: "PagerDuty" },
  { envVar: "SIEM_WEBHOOK_SPLUNK",    formatter: formatSplunk,    name: "Splunk" },
];

/** Persiste un intento de envío en siem_alert_logs. Fire-and-forget, nunca lanza. */
async function persistDelivery(
  pattern: SiemPattern,
  targetName: string,
  status: "success" | "failed",
  responseCode: number | null,
  errorMessage: string | null,
): Promise<void> {
  try {
    await directDb.insert(siemAlertLogs).values({
      ruleEventType: pattern.eventType,
      ip: pattern.ip,
      severity: pattern.severity,
      label: pattern.label,
      count: pattern.count,
      windowMinutes: pattern.windowMinutes,
      target: targetName,
      status,
      responseCode,
      errorMessage,
      metadata: { firstSeen: pattern.firstSeen.toISOString(), lastSeen: pattern.lastSeen.toISOString() },
      detectedAt: pattern.firstSeen,
    });
  } catch (err) {
    // Fail-safe: el SIEM nunca debe romperse por un fallo de persistencia
    console.error("[siem-exporter] persistDelivery falló:", err instanceof Error ? err.message : err);
  }
}

async function sendAlerts(patterns: SiemPattern[]): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);

  if (webhookTargets.length === 0) {
    errors.push("No hay webhooks SIEM configurados (SIEM_WEBHOOK_SLACK / PAGERDUTY / SPLUNK)");
    return { sent, failed, errors };
  }

  for (const pattern of patterns) {
    for (const target of webhookTargets) {
      try {
        const payload = target.formatter(pattern);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(payload.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...payload.headers },
          body: JSON.stringify(payload.body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          sent++;
          await persistDelivery(pattern, target.name, "success", res.status, null);
        } else {
          const errText = await res.text().catch(() => "unknown");
          errors.push(`[${target.name}] ${res.status} \u2192 ${errText.slice(0, 200)}`);
          failed++;
          await persistDelivery(pattern, target.name, "failed", res.status, errText.slice(0, 500));
        }
      } catch (err: unknown) {
        const siemErr = err as { message?: string };
        errors.push(`[${target.name}] ${siemErr.message || String(err)}`);
        failed++;
        await persistDelivery(pattern, target.name, "failed", null, (siemErr.message || "Unknown error").slice(0, 500));
      }
    }
  }

  return { sent, failed, errors };
}

export interface SiemTestResult {
  targetsAttempted: number;
  success: boolean;
  details: Array<{ name: string; status: "ok" | "error"; message: string }>;
}

/**
 * Envía un evento de prueba a TODOS los webhooks SIEM configurados.
 * Sirve para verificar conectividad sin alterar la base de datos.
 *
 * Ejemplo:
 *   const result = await sendTestAlert();
 *   // → { targetsAttempted: 2, success: true, details: [...] }
 */
export async function sendTestAlert(): Promise<SiemTestResult> {
  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);
  const details: SiemTestResult["details"] = [];

  if (webhookTargets.length === 0) {
    return {
      targetsAttempted: 0,
      success: false,
      details: [{ name: "system", status: "error", message: "No hay webhooks SIEM configurados" }],
    };
  }

  // Create a fake SiemPattern with clearly test data
  const testPattern: SiemPattern = {
    eventType: "open_redirect_attempt",
    ip: "198.51.100.99",
    count: 3,
    windowMinutes: 5,
    severity: "critical",
    label: "🧪 SIEM Test Alert",
    firstSeen: new Date(Date.now() - 300_000),
    lastSeen: new Date(),
    paths: ["/auth/callback"],
    methods: ["GET"],
    metadataSamples: [{
      attemptedNext: "//evil.com",
      blockedReason: "test: protocol-relative URL",
      test: true,
      timestamp: new Date().toISOString(),
    }],
  };

  for (const target of webhookTargets) {
    try {
      const payload = target.formatter(testPattern);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(payload.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...payload.headers },
        body: JSON.stringify(payload.body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        details.push({ name: target.name, status: "ok", message: `${res.status} OK` });
      } else {
        const errText = await res.text().catch(() => "unknown");
        details.push({ name: target.name, status: "error", message: `${res.status}: ${errText.slice(0, 200)}` });
      }
    } catch (err: unknown) {
      details.push({ name: target.name, status: "error", message: (err as { message?: string }).message || "Unknown error" });
    }
  }

  return {
    targetsAttempted: webhookTargets.length,
    success: details.every(d => d.status === "ok"),
    details,
  };
}

// ─── 6. Heartbeat ────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Query the timestamp of the most recent successful heartbeat. */
async function lastHeartbeatTime(): Promise<Date | null> {
  try {
    const rows = await directDb
      .select({ createdAt: siemAlertLogs.createdAt })
      .from(siemAlertLogs)
      .where(
        and(
          eq(siemAlertLogs.ruleEventType, "heartbeat"),
          eq(siemAlertLogs.status, "success"),
        ),
      )
      .orderBy(desc(siemAlertLogs.createdAt))
      .limit(1);
    return rows.length > 0 ? rows[0].createdAt : null;
  } catch {
    // Fail-safe
    return null;
  }
}

/** Check if a heartbeat is due (>= 30 min since last one). */
async function heartbeatDue(): Promise<{
  due: boolean;
  lastHeartbeatAgoMinutes: number | null;
}> {
  const last = await lastHeartbeatTime();
  if (!last) {
    // No heartbeat ever sent — send one now
    return { due: true, lastHeartbeatAgoMinutes: null };
  }
  const elapsed = Date.now() - last.getTime();
  return {
    due: elapsed >= HEARTBEAT_INTERVAL_MS,
    lastHeartbeatAgoMinutes: Math.floor(elapsed / 60_000),
  };
}

/** Send a SIEM heartbeat ping to all configured webhooks.
 *  The heartbeat confirms the entire pipeline is healthy:
 *  DB queries work, pattern detection runs, webhooks are reachable.
 */
async function sendHeartbeat(): Promise<SiemHeartbeatInfo> {
  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);

  if (webhookTargets.length === 0) {
    return { sent: false, reason: "no_webhooks", lastHeartbeatAgoMinutes: null };
  }

  const now = new Date();
  const heartbeatPattern: SiemPattern = {
    eventType: "heartbeat",
    ip: "system",
    count: 0,
    windowMinutes: 30,
    severity: "info",
    label: "💓 SIEM Heartbeat",
    firstSeen: now,
    lastSeen: now,
    paths: [],
    methods: [],
    metadataSamples: [{
      uptime: process.uptime().toFixed(0) + "s",
      nodeEnv: process.env.NODE_ENV || "unknown",
      timestamp: now.toISOString(),
      heartbeat: true,
    }],
  };

  const result = await sendAlerts([heartbeatPattern]);

  if (result.sent > 0) {
    return { sent: true, reason: "due", lastHeartbeatAgoMinutes: null };
  }

  return { sent: false, reason: "error", lastHeartbeatAgoMinutes: null };
}

// ─── 7. Main Export ──────────────────────────────────────────────────────────

/**
 * Ejecuta el exportador SIEM:
 * 1. Agrupa rules por ventana única (5min, 10min) — máximo 2 queries
 * 2. Por cada ventana, consulta grupos agregados (eventType + IP)
 * 3. Detecta patrones que superan umbrales contra SU propia ventana
 * 4. Fetch samples solo para los patrones que matchean
 * 5. Envía alertas a todos los webhooks configurados
 * 6. Envía heartbeat cada 30 min para verificar el pipeline completo
 */
export async function runSiemExport(): Promise<SiemResult> {
  const maxWindow = Math.max(...RULES.map(r => r.windowMinutes));
  const errors: string[] = [];
  let heartbeat: SiemHeartbeatInfo = { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: null };

  try {
    // 1 + 2. Query + detect, per unique window (máx 2 queries)
    const matched = await detectMatchingPatterns();

    let patterns: SiemPattern[] = [];
    let alertsSent = 0;
    let alertsFailed = 0;

    if (matched.length > 0) {
      // 3. Fetch samples ONLY for matching patterns
      patterns = await attachSamples(matched);

      // 4. Log detected patterns to audit trail
      for (const p of patterns) {
        logSecurityEvent("invalid_input", {
          ip: p.ip,
          path: "/api/security/siem/run",
          method: "POST",
          metadata: {
            action: "siem_pattern_detected",
            matchedEventType: p.eventType,
            count: p.count,
            windowMinutes: p.windowMinutes,
            severity: p.severity,
            label: p.label,
          },
        });
      }

      // 5. Send alerts to configured webhooks + push notifications
      const { sent, failed, errors: sendErrors } = await sendAlerts(patterns);
      errors.push(...sendErrors);
      alertsSent = sent;
      alertsFailed = failed;

      // 5b. Send push notifications to browser subscribers (siem_model_health + critical)
      await sendPushAlerts(patterns);
    }

    // 6. Heartbeat check — every 30 min
    const { due, lastHeartbeatAgoMinutes } = await heartbeatDue();
    heartbeat.lastHeartbeatAgoMinutes = lastHeartbeatAgoMinutes;

    if (due) {
      heartbeat = await sendHeartbeat();
      heartbeat.lastHeartbeatAgoMinutes = lastHeartbeatAgoMinutes; // preserve
      if (!heartbeat.sent && heartbeat.reason !== "no_webhooks") {
        errors.push("Heartbeat no enviado");
      }
    }

    return {
      scannedWindowMinutes: maxWindow,
      patternsDetected: patterns,
      heartbeat,
      alertsSent,
      alertsFailed,
      errors,
    };

  } catch (err: unknown) {
    const siemErr = err as { message?: string };
    errors.push(`SIEM export error: ${siemErr.message || String(err)}`);
    logSecurityEvent("invalid_input", {
      path: "/api/security/siem/run",
      method: "POST",
      metadata: { action: "siem_export_failed", error: siemErr.message },
    });
    return {
      scannedWindowMinutes: maxWindow,
      patternsDetected: [],
      heartbeat,
      alertsSent: 0,
      alertsFailed: 0,
      errors,
    };
  }
}
