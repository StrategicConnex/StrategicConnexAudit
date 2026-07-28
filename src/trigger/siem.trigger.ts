import { logger, schedules } from "@trigger.dev/sdk/v3";
import { runSiemExport } from "@/server/security/siem-exporter";

/**
 * SIEM Exporter — Trigger.dev task programado
 *
 * Ejecuta el exportador SIEM cada 5 minutos: consulta security_audit_logs,
 * detecta patrones sospechosos (open_redirect_attempt, rate_limit_bypass,
 * CSP violations, auth_failure bursts) y envía alertas a Slack/PagerDuty/Splunk.
 *
 * Trigger.dev maneja timeouts de hasta 1 hora (configurado en trigger.config.ts),
 * ideal para las 2 queries DB + hasta 18 llamadas webhook (6 reglas × 3 destinos).
 *
 * Variables de entorno necesarias (en Trigger.dev Dashboard → Env vars):
 *   DATABASE_URL / DIRECT_URL    → conexión a Supabase
 *   SIEM_WEBHOOK_SLACK           → opcional
 *   SIEM_WEBHOOK_PAGERDUTY       → opcional
 *   SIEM_PAGERDUTY_ROUTING_KEY   → opcional
 *   SIEM_WEBHOOK_SPLUNK          → opcional
 */
export const siemExporterTask = schedules.task({
  id: "siem-exporter",
  cron: "*/5 * * * *",
  run: async () => {
    logger.info("SIEM Exporter: iniciando ciclo de análisis", {
      timestamp: new Date().toISOString(),
    });

    const result = await runSiemExport();

    if (result.patternsDetected.length > 0) {
      logger.info("SIEM Exporter: patrones detectados", {
        patternsCount: result.patternsDetected.length,
        patterns: result.patternsDetected.map((p) => ({
          eventType: p.eventType,
          ip: p.ip,
          count: p.count,
          severity: p.severity,
        })),
      });
    }

    if (result.alertsSent > 0) {
      logger.info("SIEM Exporter: alertas enviadas", {
        sent: result.alertsSent,
        failed: result.alertsFailed,
      });
    }

    if (result.errors.length > 0) {
      logger.warn("SIEM Exporter: errores parciales", {
        errors: result.errors,
      });
    }

    if (result.patternsDetected.length === 0) {
      logger.info("SIEM Exporter: sin patrones detectados — todo normal");
    }

    return {
      success: result.errors.length === 0,
      patternsDetected: result.patternsDetected.length,
      alertsSent: result.alertsSent,
      alertsFailed: result.alertsFailed,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    };
  },
});
