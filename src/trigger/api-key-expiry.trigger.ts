/**
 * trigger/api-key-expiry.trigger.ts
 *
 * API Key Expiry Alert — runs daily via Trigger.dev scheduled task.
 *
 * Queries developerApiKeys for keys expiring in 1-7 days and sends
 * alerts via the SIEM webhook pipeline (Slack, Email, PagerDuty, Splunk).
 *
 * Variables de entorno necesarias (en Trigger.dev Dashboard → Env vars):
 *   DATABASE_URL / DIRECT_URL     → conexión a Supabase
 *   SIEM_WEBHOOK_SLACK            → opcional (Slack webhook URL)
 *   SIEM_WEBHOOK_PAGERDUTY        → opcional
 *   SIEM_PAGERDUTY_ROUTING_KEY    → opcional
 *   SIEM_WEBHOOK_SPLUNK           → opcional
 *   RESEND_API_KEY                → opcional (para alertas por email)
 *   SIEM_EMAIL_FROM / SIEM_EMAIL_TO → opcional (direcciones de email)
 */

import { logger, schedules } from "@trigger.dev/sdk/v3";
import { runApiKeyExpiryCheck } from "@/server/security/api-key-expiry-alert";

export const apiKeyExpiryAlert = schedules.task({
  id: "api-key-expiry-alert",
  // Run daily at 09:00 UTC
  cron: "0 9 * * *",
  run: async () => {
    logger.info("API Key Expiry Alert: iniciando verificación diaria", {
      timestamp: new Date().toISOString(),
    });

    const result = await runApiKeyExpiryCheck();

    if (result.expiringKeysFound > 0) {
      logger.info("API Key Expiry Alert: claves próximas a expirar detectadas", {
        count: result.expiringKeysFound,
        keys: result.keys.map((k) => ({
          name: k.keyName,
          prefix: k.keyPrefix,
          daysRemaining: k.daysRemaining,
        })),
      });

      if (result.alertsSent > 0) {
        logger.info("API Key Expiry Alert: alertas enviadas", {
          sent: result.alertsSent,
          failed: result.alertsFailed,
        });
      }
    } else {
      logger.info("API Key Expiry Alert: sin claves próximas a expirar — todo normal");
    }

    if (result.errors.length > 0) {
      logger.warn("API Key Expiry Alert: errores parciales", {
        errors: result.errors,
      });
    }

    return {
      success: result.errors.length === 0,
      expiringKeysFound: result.expiringKeysFound,
      alertsSent: result.alertsSent,
      alertsFailed: result.alertsFailed,
      keys: result.keys.length > 0 ? result.keys : undefined,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    };
  },
});
