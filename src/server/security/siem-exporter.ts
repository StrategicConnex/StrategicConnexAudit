/* ═══════════════════════════════════════════════════════════════════════════
   SIEM Exporter — Security Audit Log Forwarder
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
  reason: string;
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

interface RawGroup {
  eventType: string;
  ip: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

// ─── Configuración ────────────────────────────────────────────────────────────

interface Rule {
  eventType: string; threshold: number; windowMinutes: number;
  severity: "critical" | "warning" | "info"; label: string;
}

const RULES: Rule[] = [
  { eventType: "open_redirect_attempt", threshold: 3,  windowMinutes: 5,  severity: "critical", label: "\u{1F6A8} Open Redirect Attack" },
  { eventType: "rate_limit_bypass",     threshold: 1,  windowMinutes: 5,  severity: "critical", label: "\u{1F6A8} Rate Limit Bypass" },
  { eventType: "ai_model_health",       threshold: 1,  windowMinutes: 5,  severity: "critical", label: "\u{1F6A8} AI Model Failure" },
  { eventType: "rate_limit_hit",        threshold: 20, windowMinutes: 5,  severity: "warning",  label: "\u26A0\uFE0F Rate Limit Spike" },
  { eventType: "csp_violation",         threshold: 10, windowMinutes: 10, severity: "warning",  label: "\u26A0\uFE0F CSP Violation Spike" },
  { eventType: "auth_failure",          threshold: 5,  windowMinutes: 5,  severity: "warning",  label: "\u26A0\uFE0F Auth Failure Burst" },
  { eventType: "invalid_input",         threshold: 10, windowMinutes: 5,  severity: "info",     label: "\u2139\uFE0F Invalid Input Spike" },
];

// ─── 1. Query aggregated groups ─────────────────────────────────────────────

async function queryAggregated(since: Date): Promise<RawGroup[]> {
  return await directDb.select({
    eventType: securityAuditLogs.eventType, ip: securityAuditLogs.ip,
    count: sql<number>`count(*)`,
    firstSeen: sql<Date>`min(${securityAuditLogs.createdAt})`,
    lastSeen: sql<Date>`max(${securityAuditLogs.createdAt})`,
  }).from(securityAuditLogs)
    .where(gte(securityAuditLogs.createdAt, since))
    .groupBy(securityAuditLogs.eventType, securityAuditLogs.ip)
    .orderBy(sql`count(*) desc`);
}

// ─── 2. Pattern detection ──────────────────────────────────────────────────

async function detectMatchingPatterns(): Promise<Array<RawGroup & { rule: Rule }>> {
  const rulesByWindow = new Map<number, Rule[]>();
  for (const rule of RULES) {
    const arr = rulesByWindow.get(rule.windowMinutes) || [];
    arr.push(rule); rulesByWindow.set(rule.windowMinutes, arr);
  }
  const matched: Array<RawGroup & { rule: Rule }> = [];
  for (const [windowMinutes, rules] of rulesByWindow) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const groups = await queryAggregated(since);
    for (const group of groups) {
      for (const rule of rules) {
        if (group.eventType === rule.eventType && group.count >= rule.threshold) {
          matched.push({ ...group, rule }); break;
        }
      }
    }
  }
  return matched;
}

// ─── 3. Fetch samples ──────────────────────────────────────────────────────

async function attachSamples(matched: Array<RawGroup & { rule: Rule }>): Promise<SiemPattern[]> {
  const patterns: SiemPattern[] = [];
  for (const m of matched) {
    const since = new Date(Date.now() - m.rule.windowMinutes * 60_000);
    const samples = await directDb.select({
      path: securityAuditLogs.path, method: securityAuditLogs.method,
      metadata: securityAuditLogs.metadata,
    }).from(securityAuditLogs)
      .where(and(eq(securityAuditLogs.eventType, m.eventType), eq(securityAuditLogs.ip, m.ip), gte(securityAuditLogs.createdAt, since)))
      .limit(10);
    patterns.push({
      eventType: m.eventType, ip: m.ip, count: m.count, windowMinutes: m.rule.windowMinutes,
      severity: m.rule.severity, label: m.rule.label, firstSeen: m.firstSeen, lastSeen: m.lastSeen,
      paths: [...new Set(samples.map(s => s.path))],
      methods: [...new Set(samples.map(s => s.method))],
      metadataSamples: samples.map(s => (s.metadata ?? {}) as Record<string, unknown>),
    });
  }
  return patterns;
}

// ─── 4. Webhook Formatters ────────────────────────────────────────────────────

interface WebhookPayload { url: string; body: unknown; headers?: Record<string, string>; }

function formatSlack(pattern: SiemPattern): WebhookPayload {
  const lines = [`*${pattern.label}*`];
  lines.push(`\u2022 *IP:* \`${pattern.ip}\``);
  lines.push(`\u2022 *Count:* ${pattern.count} en ${pattern.windowMinutes} min`);
  lines.push(`\u2022 *Window:* ${pattern.firstSeen.toISOString()} \u2192 ${pattern.lastSeen.toISOString()}`);
  if (pattern.paths.length > 0) lines.push(`\u2022 *Paths:* ${pattern.paths.map(p => `\`${p}\``).join(", ")}`);
  if (pattern.metadataSamples.length > 0) {
    const sample = pattern.metadataSamples[0]!;
    const extra = Object.entries(sample).filter(([k]) => !["ip","path","method"].includes(k))
      .map(([k, v]) => `\u2022 *${k}:* ${typeof v === "object" ? `\`${JSON.stringify(v)}\`` : v}`).join("\n");
    if (extra) lines.push(extra);
  }
  return {
    url: process.env.SIEM_WEBHOOK_SLACK || "", body: {
      text: "", blocks: [
        { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
        { type: "context", elements: [{ type: "mrkdwn", text: `\u{1F6E1}\uFE0F *SCAUDIT SIEM* \u00B7 ${new Date().toISOString()}` }] },
        { type: "divider" },
      ],
    },
  };
}

function formatPagerDuty(pattern: SiemPattern): WebhookPayload {
  return {
    url: process.env.SIEM_WEBHOOK_PAGERDUTY || "", headers: { "Content-Type": "application/json" },
    body: {
      routing_key: process.env.SIEM_PAGERDUTY_ROUTING_KEY || "", event_action: "trigger",
      dedup_key: `siem_${pattern.eventType}_${pattern.ip}_${pattern.firstSeen.getTime()}`,
      payload: {
        summary: `${pattern.label} \u2014 ${pattern.count} eventos desde ${pattern.ip}`, source: pattern.ip,
        severity: pattern.severity, timestamp: pattern.lastSeen.toISOString(),
        component: "security-audit", group: pattern.eventType, class: "security_event",
        custom_details: { count: pattern.count, windowMinutes: pattern.windowMinutes, firstSeen: pattern.firstSeen.toISOString(), lastSeen: pattern.lastSeen.toISOString(), paths: pattern.paths, methods: pattern.methods, metadataSamples: pattern.metadataSamples },
      },
    },
  };
}

function formatSplunk(pattern: SiemPattern): WebhookPayload {
  return {
    url: process.env.SIEM_WEBHOOK_SPLUNK || "", body: {
      event: "security_alert", sourcetype: "scaudit:siem:alert",
      fields: {
        alert_type: pattern.eventType, severity: pattern.severity, ip: pattern.ip,
        count: pattern.count, window_minutes: pattern.windowMinutes,
        first_seen: pattern.firstSeen.toISOString(), last_seen: pattern.lastSeen.toISOString(),
        paths: pattern.paths, methods: pattern.methods, metadata: pattern.metadataSamples, source: "SCAUDIT SIEM",
      },
    },
  };
}

function formatEmail(pattern: SiemPattern): WebhookPayload {
  const fromAddr = process.env.SIEM_EMAIL_FROM || "scaudit@alerts.local";
  const toAddr = process.env.SIEM_EMAIL_TO || "";
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!toAddr || !apiKey) return { url: "", body: {} };

  const severityEmoji: Record<string, string> = { critical: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" };
  const sevEmoji = severityEmoji[pattern.severity] || "\u{1F535}";
  const subject = `[SCAUDIT SIEM] ${sevEmoji} ${pattern.label} \u2014 ${pattern.count} eventos desde ${pattern.ip}`;

  const metadataRows = pattern.metadataSamples.length > 0
    ? pattern.metadataSamples.slice(0, 1).map(sample =>
        Object.entries(sample).filter(([k]) => !["ip","path","method"].includes(k))
          .map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #2a2a2a;color:#a1a1aa;font-size:12px;white-space:nowrap;text-transform:capitalize;background:#111">${escapeHtml(k)}</td><td style="padding:6px 12px;border:1px solid #2a2a2a;color:#e4e4e7;font-size:12px;font-family:monospace;background:#111">${typeof v === "object" ? escapeHtml(JSON.stringify(v)) : escapeHtml(String(v))}</td></tr>`).join("\n")
      ).join("")
    : "";

  const pathsHtml = pattern.paths.length > 0
    ? pattern.paths.map(p => `<code style="background:#1a1a1a;color:#22d3ee;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace">${escapeHtml(p)}</code>`).join(" ")
    : "";

  let extraSectionsHtml = "";
  if (pathsHtml) {
    extraSectionsHtml += `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f"><tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#52525b;border-bottom:1px solid #1f1f1f">\u{1F517} Paths Afectados</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#a1a1aa">${pathsHtml}</td></tr></table>`;
  }
  if (metadataRows) {
    extraSectionsHtml += `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f"><tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#52525b;border-bottom:1px solid #1f1f1f">\u{1F4CB} Metadata</td></tr><tr><td style="padding:8px 16px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${metadataRows}</table></td></tr></table>`;
  }
  if (pattern.methods.length > 0) {
    extraSectionsHtml += `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f"><tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#52525b;border-bottom:1px solid #1f1f1f">\u{1F4E1} M\u00E9todos HTTP</td></tr><tr><td style="padding:12px 16px;font-size:13px;color:#a1a1aa">${pattern.methods.join(", ")}</td></tr></table>`;
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a">
<tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden">
<tr>
  <td style="background:linear-gradient(135deg,#0f0f0f,#1a1a1a);padding:32px 32px 24px;border-bottom:1px solid #2a2a2a">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-size:14px;color:#52525b;letter-spacing:2px;text-transform:uppercase">SCAUDIT SIEM</span>
          <h1 style="margin:8px 0 0;font-size:24px;color:#e4e4e7;font-weight:600">${escapeHtml(pattern.label)}</h1>
        </td>
        <td align="right" style="vertical-align:top">
          <span style="display:inline-block;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;${
            pattern.severity === "critical" ? "background:#dc262610;color:#f87171;border:1px solid #dc262630"
            : pattern.severity === "warning" ? "background:#f59e0b10;color:#fbbf24;border:1px solid #f59e0b30"
            : "background:#3b82f610;color:#60a5fa;border:1px solid #3b82f630"
          }">${pattern.severity.toUpperCase()}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr><td style="padding:24px 32px">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="33%" style="padding:12px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#e4e4e7">${pattern.count}</div>
        <div style="font-size:11px;color:#52525b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Eventos</div>
      </td>
      <td width="33%" style="padding:12px 8px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#e4e4e7">${pattern.windowMinutes}m</div>
        <div style="font-size:11px;color:#52525b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Ventana</div>
      </td>
      <td width="33%" style="padding:12px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f;text-align:center">
        <div style="font-size:16px;font-weight:600;color:#22d3ee;font-family:monospace">${escapeHtml(pattern.ip)}</div>
        <div style="font-size:11px;color:#52525b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">Origen</div>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#0f0f0f;border-radius:8px;border:1px solid #1f1f1f">
    <tr><td style="padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#52525b;border-bottom:1px solid #1f1f1f">\u23F1 Timeline</td></tr>
    <tr><td style="padding:12px 16px;font-size:13px;color:#a1a1aa">
      <strong style="color:#e4e4e7">First seen:</strong> ${pattern.firstSeen.toISOString()}<br>
      <strong style="color:#e4e4e7">Last seen:</strong> ${pattern.lastSeen.toISOString()}
    </td></tr>
  </table>

  ${extraSectionsHtml}

</td></tr>

<tr>
  <td style="padding:16px 32px;background:#0a0a0a;border-top:1px solid #1f1f1f;text-align:center">
    <span style="font-size:11px;color:#52525b">
      \u{1F6E1}\uFE0F <strong style="color:#71717a">SCAUDIT</strong> \u00B7 Security Alerting & Intelligence Monitoring<br>
      <span style="font-size:10px;color:#3f3f46">${new Date().toISOString()}</span>
    </span>
  </td>
</tr>
</table>
</td></tr></table>
</body></html>`;

  return {
    url: "https://api.resend.com/emails", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: { from: fromAddr, to: [toAddr], subject, html },
  };
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ─── 5. Sender ────────────────────────────────────────────────────────────────

export const WEBHOOK_FORMATTERS: Array<{ envVar: string; formatter: (p: SiemPattern) => WebhookPayload; name: string; }> = [
  { envVar: "SIEM_WEBHOOK_SLACK",     formatter: formatSlack,     name: "Slack" },
  { envVar: "SIEM_WEBHOOK_PAGERDUTY", formatter: formatPagerDuty, name: "PagerDuty" },
  { envVar: "SIEM_WEBHOOK_SPLUNK",    formatter: formatSplunk,    name: "Splunk" },
  { envVar: "RESEND_API_KEY",         formatter: formatEmail,    name: "Email" },
];

async function sendPushAlerts(patterns: SiemPattern[]): Promise<void> {
  try {
    const { sendPushNotificationToAll } = await import("@/server/notifications/push");
    for (const p of patterns) {
      if (p.eventType === "ai_model_health") {
        await sendPushNotificationToAll({
          title: p.label, body: `Evento: ${p.eventType} \u2022 IP: ${p.ip} \u2022 ${p.count} ocurrencias en ${p.windowMinutes} min`,
          tag: `siem-${p.eventType}-${p.ip}`, url: "/ai/health",
          data: { eventType: p.eventType, ip: p.ip, count: p.count, severity: p.severity },
        });
      }
    }
  } catch { /* fail-safe */ }
}

export async function persistDelivery(pattern: SiemPattern, targetName: string, status: "success" | "failed", responseCode: number | null, errorMessage: string | null, extraMetadata?: Record<string, unknown>): Promise<void> {
  try {
    await directDb.insert(siemAlertLogs).values({
      ruleEventType: pattern.eventType, ip: pattern.ip, severity: pattern.severity, label: pattern.label,
      count: pattern.count, windowMinutes: pattern.windowMinutes, target: targetName, status,
      responseCode, errorMessage,
      metadata: {
        firstSeen: pattern.firstSeen.toISOString(),
        lastSeen: pattern.lastSeen.toISOString(),
        ...(pattern.metadataSamples.length > 0 ? { metadataSamples: pattern.metadataSamples } : {}),
        ...(extraMetadata ?? {}),
      },
      detectedAt: pattern.firstSeen,
    });
  } catch { /* fail-safe */ }
}

async function sendAlerts(patterns: SiemPattern[]): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0, failed = 0; const errors: string[] = [];
  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);
  if (webhookTargets.length === 0) { errors.push("No hay canales SIEM configurados"); return { sent, failed, errors }; }
  for (const pattern of patterns) {
    for (const target of webhookTargets) {
      try {
        const payload = target.formatter(pattern);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(payload.url, { method: "POST", headers: { "Content-Type": "application/json", ...payload.headers }, body: JSON.stringify(payload.body), signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) { sent++; await persistDelivery(pattern, target.name, "success", res.status, null); }
        else { const errText = await res.text().catch(() => "unknown"); errors.push(`[${target.name}] ${res.status} \u2192 ${errText.slice(0, 200)}`); failed++; await persistDelivery(pattern, target.name, "failed", res.status, errText.slice(0, 500)); }
      } catch (err: unknown) { const siemErr = err as { message?: string }; errors.push(`[${target.name}] ${siemErr.message || String(err)}`); failed++; await persistDelivery(pattern, target.name, "failed", null, (siemErr.message || "Unknown error").slice(0, 500)); }
    }
  }
  return { sent, failed, errors };
}

export interface SiemTestResult { targetsAttempted: number; success: boolean; details: Array<{ name: string; status: "ok" | "error"; message: string }>; }

export async function sendTestAlert(): Promise<SiemTestResult> {
  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]); const details: SiemTestResult["details"] = [];
  if (webhookTargets.length === 0) { return { targetsAttempted: 0, success: false, details: [{ name: "system", status: "error", message: "No hay webhooks SIEM configurados" }] }; }
  const testPattern: SiemPattern = {
    eventType: "open_redirect_attempt", ip: "198.51.100.99", count: 3, windowMinutes: 5, severity: "critical", label: "\u{1F9EA} SIEM Test Alert",
    firstSeen: new Date(Date.now() - 300000), lastSeen: new Date(), paths: ["/auth/callback"], methods: ["GET"],
    metadataSamples: [{ attemptedNext: "//evil.com", blockedReason: "test: protocol-relative URL", test: true, timestamp: new Date().toISOString() }],
  };
  for (const target of webhookTargets) {
    try {
      const payload = target.formatter(testPattern); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(payload.url, { method: "POST", headers: { "Content-Type": "application/json", ...payload.headers }, body: JSON.stringify(payload.body), signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) details.push({ name: target.name, status: "ok", message: `${res.status} OK` });
      else { const errText = await res.text().catch(() => "unknown"); details.push({ name: target.name, status: "error", message: `${res.status}: ${errText.slice(0, 200)}` }); }
    } catch (err: unknown) { details.push({ name: target.name, status: "error", message: (err as { message?: string }).message || "Unknown error" }); }
  }
  return { targetsAttempted: webhookTargets.length, success: details.every(d => d.status === "ok"), details };
}

// ─── 6. Heartbeat ────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

async function lastHeartbeatTime(): Promise<Date | null> {
  try {
    const rows = await directDb.select({ createdAt: siemAlertLogs.createdAt }).from(siemAlertLogs)
      .where(and(eq(siemAlertLogs.ruleEventType, "heartbeat"), eq(siemAlertLogs.status, "success")))
      .orderBy(desc(siemAlertLogs.createdAt)).limit(1);
    return rows.length > 0 ? rows[0]!.createdAt : null;
  } catch { return null; }
}

async function heartbeatDue(): Promise<{ due: boolean; lastHeartbeatAgoMinutes: number | null }> {
  const last = await lastHeartbeatTime();
  if (!last) return { due: true, lastHeartbeatAgoMinutes: null };
  const elapsed = Date.now() - last.getTime();
  return { due: elapsed >= HEARTBEAT_INTERVAL_MS, lastHeartbeatAgoMinutes: Math.floor(elapsed / 60000) };
}

async function sendHeartbeat(): Promise<SiemHeartbeatInfo> {
  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);
  if (webhookTargets.length === 0) return { sent: false, reason: "no_webhooks", lastHeartbeatAgoMinutes: null };
  const now = new Date();
  const heartbeatPattern: SiemPattern = {
    eventType: "heartbeat", ip: "system", count: 0, windowMinutes: 30, severity: "info",
    label: "\u{1F493} SIEM Heartbeat", firstSeen: now, lastSeen: now, paths: [], methods: [],
    metadataSamples: [{ uptime: process.uptime().toFixed(0) + "s", nodeEnv: process.env.NODE_ENV || "unknown", timestamp: now.toISOString(), heartbeat: true }],
  };
  const result = await sendAlerts([heartbeatPattern]);
  return result.sent > 0 ? { sent: true, reason: "due", lastHeartbeatAgoMinutes: null } : { sent: false, reason: "error", lastHeartbeatAgoMinutes: null };
}

// ─── 7. Main Export ──────────────────────────────────────────────────────────

export async function runSiemExport(): Promise<SiemResult> {
  const maxWindow = Math.max(...RULES.map(r => r.windowMinutes)); const errors: string[] = [];
  let heartbeat: SiemHeartbeatInfo = { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: null };
  try {
    const matched = await detectMatchingPatterns(); let patterns: SiemPattern[] = []; let alertsSent = 0; let alertsFailed = 0;
    if (matched.length > 0) {
      patterns = await attachSamples(matched);
      for (const p of patterns) {
        logSecurityEvent("invalid_input", { ip: p.ip, path: "/api/security/siem/run", method: "POST", metadata: { action: "siem_pattern_detected", matchedEventType: p.eventType, count: p.count, windowMinutes: p.windowMinutes, severity: p.severity, label: p.label } });
      }
      const { sent, failed, errors: sendErrors } = await sendAlerts(patterns);
      errors.push(...sendErrors); alertsSent = sent; alertsFailed = failed; await sendPushAlerts(patterns);
    }
    const { due, lastHeartbeatAgoMinutes } = await heartbeatDue(); heartbeat.lastHeartbeatAgoMinutes = lastHeartbeatAgoMinutes;
    if (due) { heartbeat = await sendHeartbeat(); heartbeat.lastHeartbeatAgoMinutes = lastHeartbeatAgoMinutes; if (!heartbeat.sent && heartbeat.reason !== "no_webhooks") errors.push("Heartbeat no enviado"); }
    return { scannedWindowMinutes: maxWindow, patternsDetected: patterns, heartbeat, alertsSent, alertsFailed, errors };
  } catch (err: unknown) {
    const siemErr = err as { message?: string }; errors.push(`SIEM export error: ${siemErr.message || String(err)}`);
    logSecurityEvent("invalid_input", { path: "/api/security/siem/run", method: "POST", metadata: { action: "siem_export_failed", error: siemErr.message } });
    return { scannedWindowMinutes: maxWindow, patternsDetected: [], heartbeat, alertsSent: 0, alertsFailed: 0, errors };
  }
}
