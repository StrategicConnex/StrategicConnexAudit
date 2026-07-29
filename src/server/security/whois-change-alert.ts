/**
 * whois-change-alert.ts — WHOIS Change Alerting via SIEM Webhooks
 *
 * Cuando persistWhoisSnapshot() detecta cambios en un dominio
 * (registrador, expiración, nameservers, organización registrante),
 * este módulo construye alertas SiemPattern y las envía a todos
 * los canales SIEM configurados (Slack, Email, PagerDuty, Splunk).
 *
 * Integración:
 *   whoisFullExecutor → persistWhoisSnapshot().then(result => {
 *     if (result.changes.length > 0) sendWhoisChangeAlerts(...)
 *   })
 *
 * Reutiliza WEBHOOK_FORMATTERS, persistDelivery, y SiemPattern
 * del módulo siem-exporter.ts existente.
 */

import { logSecurityEvent } from "@/shared/lib/audit-log";
import { WEBHOOK_FORMATTERS, persistDelivery, type SiemPattern } from "@/server/security/siem-exporter";
import type { WhoisChange } from "@/server/intelligence/history/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhoisChangeAlertResult {
  changesDetected: number;
  alertsSent: number;
  alertsFailed: number;
  errors: string[];
  domain: string;
  changes: Array<{ field: string; label: string; severity: string }>;
}

const CHANGE_EMOJIS: Record<string, string> = {
  registrar: "🏢",
  expiresDate: "📅",
  nameservers: "🌐",
  registrantOrg: "🏛️",
};

// ─── 1. Build SiemPattern from WhoisChange[] ──────────────────────────────────

/**
 * Convierte una lista de cambios WHOIS en un SiemPattern listo para
 * ser enviado a Slack, Email, PagerDuty, y Splunk via WEBHOOK_FORMATTERS.
 *
 * Agrupa múltiples cambios del mismo dominio en una sola alerta para
 * evitar saturar los canales SIEM.
 */
function buildWhoisAlertPattern(
  domain: string,
  changes: WhoisChange[],
): SiemPattern {
  const now = new Date();

  // Determinar severidad máxima entre los cambios
  const maxSeverity: "critical" | "warning" | "info" =
    changes.some((c) => c.severity === "critical")
      ? "critical"
      : changes.some((c) => c.severity === "warning")
        ? "warning"
        : "info";

  const severityEmoji = maxSeverity === "critical" ? "🔴" : maxSeverity === "warning" ? "🟡" : "🔵";
  const fieldLabels = changes.map((c) => c.label).join(", ");

  return {
    eventType: "whois_change_detected",
    ip: domain, // El dominio actúa como identificador
    count: changes.length,
    windowMinutes: 60, // Ventana de 1 hora para agrupar cambios del mismo dominio
    severity: maxSeverity,
    label: `${severityEmoji} WHOIS Change: ${domain} (${fieldLabels})`,
    firstSeen: changes[0]?.detectedAt ?? now,
    lastSeen: changes[changes.length - 1]?.detectedAt ?? now,
    paths: ["/api/intelligence/history"],
    methods: ["WHOIS_SCAN"],
    metadataSamples: changes.map((c) => ({
      domain,
      field: c.field,
      label: c.label,
      severity: c.severity,
      previousValue: c.previousValue,
      currentValue: c.currentValue,
      detectedAt: c.detectedAt.toISOString(),
      emoji: CHANGE_EMOJIS[c.field] || "📋",
    })),
  };
}

// ─── 2. Send ──────────────────────────────────────────────────────────────────

/**
 * Envía alertas de cambios WHOIS a todos los canales SIEM configurados.
 * Reutiliza WEBHOOK_FORMATTERS y persistDelivery de siem-exporter.ts.
 */
async function sendWhoisAlerts(
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
 * Envía alertas SIEM por cambios WHOIS detectados en un dominio.
 *
 * Uso típico (fire-and-forget desde el executor):
 *   sendWhoisChangeAlerts(domain, changes)
 *     .then(result => console.log(`Alertas enviadas: ${result.alertsSent}`))
 *     .catch(err => console.error(err))
 *
 * @param domain  - El dominio donde se detectaron los cambios
 * @param changes - Lista de cambios detectados por persistWhoisSnapshot()
 * @returns       - Estadísticas de envío para logging
 */
export async function sendWhoisChangeAlerts(
  domain: string,
  changes: WhoisChange[],
): Promise<WhoisChangeAlertResult> {
  const result: WhoisChangeAlertResult = {
    changesDetected: changes.length,
    alertsSent: 0,
    alertsFailed: 0,
    errors: [],
    domain,
    changes: changes.map((c) => ({
      field: c.field,
      label: c.label,
      severity: c.severity,
    })),
  };

  if (changes.length === 0) return result;

  console.log(`[WHOIS Change Alert] ${changes.length} cambio(s) en ${domain}: ${changes.map((c) => `${c.label} (${c.severity})`).join(", ")}`);

  try {
    // Log each change to security audit trail
    for (const change of changes) {
      logSecurityEvent("invalid_input", {
        ip: domain,
        path: "/api/intelligence/history",
        method: "WHOIS_SCAN",
        metadata: {
          action: "whois_change_detected",
          domain,
          field: change.field,
          label: change.label,
          severity: change.severity,
          previousValue: change.previousValue,
          currentValue: change.currentValue,
        },
      });
    }

    // Build pattern and send alerts
    const pattern = buildWhoisAlertPattern(domain, changes);
    const { sent, failed, errors: sendErrors } = await sendWhoisAlerts([pattern]);

    result.alertsSent = sent;
    result.alertsFailed = failed;
    result.errors.push(...sendErrors);

    console.log(`[WHOIS Change Alert] Enviadas: ${sent}, Fallidas: ${failed} para ${domain}`);
  } catch (err: unknown) {
    const wErr = err as { message?: string };
    result.errors.push(`WHOIS change alert error: ${wErr.message || String(err)}`);
    console.error(`[WHOIS Change Alert] Error:`, wErr.message || err);
  }

  return result;
}
