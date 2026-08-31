/**
 * dns-change-alert.ts — DNS Change Alerting via SIEM Webhooks
 *
 * Cuando processDnsResults() → detectDnsChanges() encuentra cambios en
 * registros DNS (A, AAAA, MX, NS, TXT), este módulo construye alertas
 * SiemPattern y las envía a todos los canales SIEM configurados.
 *
 * Integración:
 *   processDnsResults() → detectDnsChanges() → sendDnsChangeAlerts(domain, changes)
 *
 * Reutiliza WEBHOOK_FORMATTERS, persistDelivery, y SiemPattern
 * del módulo siem-exporter.ts existente.
 */

import { logSecurityEvent } from "@/shared/lib/audit-log";
import { WEBHOOK_FORMATTERS, persistDelivery, type SiemPattern } from "@/server/security/siem-exporter";
import type { DnsChange } from "@/server/intelligence/history/types";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DnsChangeAlertResult {
  changesDetected: number;
  alertsSent: number;
  alertsFailed: number;
  errors: string[];
  domain: string;
  changes: Array<{ recordType: string; type: string; severity: string }>;
}

const RECORD_EMOJIS: Record<string, string> = {
  A: "🌐",
  AAAA: "🌐",
  MX: "📧",
  NS: "🏷️",
  TXT: "📝",
  CNAME: "🔗",
  SOA: "⚙️",
};

const TYPE_EMOJIS: Record<string, string> = {
  added: "🟢",
  changed: "🔄",
  removed: "🔴",
};

const TYPE_LABELS: Record<string, string> = {
  added: "Añadido",
  changed: "Modificado",
  removed: "Eliminado",
};

/**
 * Determina severidad según el tipo de cambio y tipo de registro DNS.
 * - MX/NS removido → critical (pérdida de servicio)
 * - MX/NS changed → warning (posible hijacking)
 * - A/AAAA changed → warning
 * - TXT changed → warning (pérdida de verificación SPF/DKIM)
 * - Cualquier added → info
 */
function changeSeverity(change: DnsChange): "critical" | "warning" | "info" {
  if (change.type === "removed" && ["MX", "NS"].includes(change.recordType)) {
    return "critical";
  }
  if (change.type === "changed") {
    return "warning";
  }
  if (change.type === "removed") {
    return "warning";
  }
  return "info";
}

// ─── 1. Build SiemPattern from DnsChange[] ───────────────────────────────────

function buildDnsAlertPattern(
  domain: string,
  changes: DnsChange[],
): SiemPattern {
  const now = new Date();

  const maxSeverity: "critical" | "warning" | "info" =
    changes.some((c) => changeSeverity(c) === "critical")
      ? "critical"
      : changes.some((c) => changeSeverity(c) === "warning")
        ? "warning"
        : "info";

  const severityEmoji = maxSeverity === "critical" ? "🔴" : maxSeverity === "warning" ? "🟡" : "🔵";
  const recordLabels = [...new Set(changes.map((c) => c.recordType))].join(", ");

  return {
    eventType: "dns_change_detected",
    ip: domain,
    count: changes.length,
    windowMinutes: 60,
    severity: maxSeverity,
    label: `${severityEmoji} DNS Change: ${domain} (${recordLabels})`,
    firstSeen: changes[0]?.detectedAt ?? now,
    lastSeen: changes[changes.length - 1]?.detectedAt ?? now,
    paths: ["/api/intelligence/history"],
    methods: ["DNS_SCAN"],
    metadataSamples: changes.map((c) => ({
      domain,
      recordType: c.recordType,
      type: c.type,
      typeLabel: TYPE_LABELS[c.type] || c.type,
      severity: changeSeverity(c),
      previousValue: c.previousValue,
      currentValue: c.currentValue,
      detectedAt: c.detectedAt.toISOString(),
      emoji: RECORD_EMOJIS[c.recordType] || "📋",
      typeEmoji: TYPE_EMOJIS[c.type] || "•",
    })),
  };
}

// ─── 2. Send ──────────────────────────────────────────────────────────────────

async function sendDnsAlerts(
  patterns: SiemPattern[],
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  const webhookTargets = WEBHOOK_FORMATTERS.filter((w) => process.env[w.envVar]);

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
        const wErr = err as { message?: string };
        errors.push(`[${target.name}] ${wErr.message || String(err)}`);
        failed++;
        await persistDelivery(pattern, target.name, "failed", null, (wErr.message || "Unknown error").slice(0, 500));
      }
    }
  }

  return { sent, failed, errors };
}

// ─── 3. Main Export ──────────────────────────────────────────────────────────

/**
 * Envía alertas SIEM por cambios DNS detectados en un dominio.
 *
 * Uso típico (integrado en processDnsResults):
 *   sendDnsChangeAlerts(domain, changes)
 *     .then(result => logger.info(`Alertas enviadas: ${result.alertsSent}`))
 *     .catch(err => logger.error(err))
 *
 * @param domain  - El dominio donde se detectaron los cambios
 * @param changes - Lista de cambios detectados por detectDnsChanges()
 * @returns       - Estadísticas de envío para logging
 */
export async function sendDnsChangeAlerts(
  domain: string,
  changes: DnsChange[],
): Promise<DnsChangeAlertResult> {
  const result: DnsChangeAlertResult = {
    changesDetected: changes.length,
    alertsSent: 0,
    alertsFailed: 0,
    errors: [],
    domain,
    changes: changes.map((c) => ({
      recordType: c.recordType,
      type: c.type,
      severity: changeSeverity(c),
    })),
  };

  if (changes.length === 0) return result;

  logger.info(`[DNS Change Alert] ${changes.length} cambio(s) en ${domain}: ${changes.map((c) => `${c.recordType} (${c.type})`).join(", ")}`);

  try {
    // Log each change to security audit trail
    for (const change of changes) {
      logSecurityEvent("invalid_input", {
        ip: domain,
        path: "/api/intelligence/history",
        method: "DNS_SCAN",
        metadata: {
          action: "dns_change_detected",
          domain,
          recordType: change.recordType,
          type: change.type,
          severity: changeSeverity(change),
          previousValue: change.previousValue,
          currentValue: change.currentValue,
        },
      });
    }

    // Build pattern and send alerts
    const pattern = buildDnsAlertPattern(domain, changes);
    const { sent, failed, errors: sendErrors } = await sendDnsAlerts([pattern]);

    result.alertsSent = sent;
    result.alertsFailed = failed;
    result.errors.push(...sendErrors);

    logger.info(`[DNS Change Alert] Enviadas: ${sent}, Fallidas: ${failed} para ${domain}`);
  } catch (err: unknown) {
    const wErr = err as { message?: string };
    result.errors.push(`DNS change alert error: ${wErr.message || String(err)}`);
    logger.error(`[DNS Change Alert] Error:`, wErr.message || err);
  }

  return result;
}
