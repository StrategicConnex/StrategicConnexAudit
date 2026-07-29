/**
 * api-key-expiry-alert.ts — API Key Expiry Alert
 *
 * Queries developerApiKeys for keys expiring in 1-7 days, formats alerts
 * as SiemPattern objects, and sends them via the SIEM webhook pipeline
 * (Slack / Email / PagerDuty / Splunk).
 *
 * Designed to be called from a daily Trigger.dev scheduled task:
 *   src/trigger/api-key-expiry.trigger.ts
 *
 * Uses the same WEBHOOK_FORMATTERS and persistDelivery as siem-exporter.ts
 * so alerts appear in the SIEM Alert Logs dashboard.
 */

import { and, gte, lte } from "drizzle-orm";
import { logSecurityEvent } from "@/shared/lib/audit-log";
import { directDb } from "@/shared/db";
import { developerApiKeys } from "@/shared/db/schemas";
import { WEBHOOK_FORMATTERS, persistDelivery, type SiemPattern } from "@/server/security/siem-exporter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpiringKeyInfo {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  userId: string;
  expiresAt: Date;
  daysRemaining: number;
  lastUsedAt: Date | null;
}

export interface ApiKeyExpiryResult {
  expiringKeysFound: number;
  alertsSent: number;
  alertsFailed: number;
  errors: string[];
  keys: Array<{
    keyName: string;
    keyPrefix: string;
    daysRemaining: number;
    lastUsedAt: string | null;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 7; // Alert for keys expiring within this many days
const MIN_EXPIRY_DAYS = 1;     // Skip keys expiring today or already expired

// ─── 1. Query ─────────────────────────────────────────────────────────────────

/**
 * Find all API keys expiring within the warning window (1-7 days from now).
 * Skips keys expiring today (daysRemaining < 1) to avoid alerting on already-gone keys.
 */
async function findExpiringKeys(): Promise<ExpiringKeyInfo[]> {
  const now = new Date();
  const maxExpiry = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86400000);
  const minExpiry = new Date(now.getTime() + MIN_EXPIRY_DAYS * 86400000);

  const rows = await directDb
    .select({
      keyId: developerApiKeys.id,
      keyName: developerApiKeys.name,
      keyPrefix: developerApiKeys.keyPrefix,
      userId: developerApiKeys.userId,
      expiresAt: developerApiKeys.expiresAt,
      lastUsedAt: developerApiKeys.lastUsedAt,
    })
    .from(developerApiKeys)
    .where(
      and(
        // expiresAt is within [minExpiry, maxExpiry] = 1-7 days from now
        gte(developerApiKeys.expiresAt, minExpiry),
        lte(developerApiKeys.expiresAt, maxExpiry),
      ),
    )
    .orderBy(developerApiKeys.expiresAt);

  return rows.map((r) => ({
    keyId: r.keyId,
    keyName: r.keyName,
    keyPrefix: r.keyPrefix,
    userId: r.userId,
    expiresAt: r.expiresAt!,
    daysRemaining: Math.ceil((r.expiresAt!.getTime() - now.getTime()) / 86400000),
    lastUsedAt: r.lastUsedAt,
  }));
}

// ─── 2. Format ────────────────────────────────────────────────────────────────

/**
 * Build a SiemPattern-compatible alert for an expiring key.
 * This uses the same shape as siem-exporter.ts patterns, so
 * WEBHOOK_FORMATTERS from that module can render it to Slack/Email/etc.
 */
function buildAlertPattern(key: ExpiringKeyInfo): SiemPattern {
  const now = new Date();
  const severity = key.daysRemaining <= 3 ? "warning" as const : "info" as const;
  const emoji = key.daysRemaining <= 3 ? "🟡" : "🔵";

  return {
    eventType: "api_key_expiry",
    ip: "api-key-management", // Placeholder — not a real IP
    count: 1,
    windowMinutes: EXPIRY_WARNING_DAYS * 1440, // 7 days in minutes
    severity,
    label: `${emoji} API Key Expiring: ${key.keyName}`,
    firstSeen: now,
    lastSeen: now,
    paths: ["/api/api-keys"],
    methods: ["MANAGEMENT"],
    metadataSamples: [{
      keyId: key.keyId,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      daysRemaining: key.daysRemaining,
      expiresAt: key.expiresAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    }],
  };
}

// ─── 3. Send ──────────────────────────────────────────────────────────────────

/**
 * Send expiry alerts to all configured SIEM webhooks.
 * Reuses the same WEBHOOK_FORMATTERS from siem-exporter.ts.
 */
async function sendExpiryAlerts(
  patterns: SiemPattern[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const webhookTargets = WEBHOOK_FORMATTERS.filter(w => process.env[w.envVar]);

  if (webhookTargets.length === 0) {
    errors.push("No hay canales SIEM configurados (SIEM_WEBHOOK_SLACK / RESEND_API_KEY / etc.)");
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
          errors.push(`[${target.name}] ${res.status} → ${errText.slice(0, 200)}`);
          failed++;
          await persistDelivery(pattern, target.name, "failed", res.status, errText.slice(0, 500));
        }
      } catch (err: unknown) {
        const expErr = err as { message?: string };
        errors.push(`[${target.name}] ${expErr.message || String(err)}`);
        failed++;
        await persistDelivery(pattern, target.name, "failed", null, (expErr.message || "Unknown error").slice(0, 500));
      }
    }
  }

  return { sent, failed, errors };
}

// ─── 4. Main Export ──────────────────────────────────────────────────────────

/**
 * Run the API key expiry alert check:
 * 1. Query developerApiKeys for keys expiring in 1-7 days
 * 2. For each key, build a SiemPattern alert
 * 3. Send alerts via all configured SIEM webhooks (Slack, Email, PagerDuty, Splunk)
 * 4. Persist delivery results to siem_alert_logs
 *
 * Returns stats for logging/reporting.
 */
export async function runApiKeyExpiryCheck(): Promise<ApiKeyExpiryResult> {
  const errors: string[] = [];

  try {
    const expiringKeys = await findExpiringKeys();

    if (expiringKeys.length === 0) {
      return {
        expiringKeysFound: 0,
        alertsSent: 0,
        alertsFailed: 0,
        errors: [],
        keys: [],
      };
    }

    console.log(`[ApiKeyExpiry] ${expiringKeys.length} keys expiring within ${EXPIRY_WARNING_DAYS} days.`);

    // Build alert patterns
    const patterns = expiringKeys.map(buildAlertPattern);

    // Log each detection to security audit trail
    for (const k of expiringKeys) {
      logSecurityEvent("invalid_input", {
        ip: "api-key-management",
        path: "/api/api-keys",
        method: "MANAGEMENT",
        metadata: {
          action: "api_key_expiry_detected",
          keyName: k.keyName,
          keyPrefix: k.keyPrefix,
          daysRemaining: k.daysRemaining,
          expiresAt: k.expiresAt.toISOString(),
        },
      });
    }

    // Send alerts
    const { sent, failed, errors: sendErrors } = await sendExpiryAlerts(patterns);
    errors.push(...sendErrors);

    console.log(`[ApiKeyExpiry] Sent: ${sent}, Failed: ${failed}`);

    return {
      expiringKeysFound: expiringKeys.length,
      alertsSent: sent,
      alertsFailed: failed,
      errors,
      keys: expiringKeys.map((k) => ({
        keyName: k.keyName,
        keyPrefix: k.keyPrefix,
        daysRemaining: k.daysRemaining,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      })),
    };
  } catch (err: unknown) {
    const expErr = err as { message?: string };
    errors.push(`API Key expiry check error: ${expErr.message || String(err)}`);
    console.error("[ApiKeyExpiry] Fatal error:", expErr.message || err);
    return {
      expiringKeysFound: 0,
      alertsSent: 0,
      alertsFailed: 0,
      errors,
      keys: [],
    };
  }
}
