import { schedules } from "@trigger.dev/sdk";
import { purgeOldNotifications } from "@/server/notifications/emit";

/**
 * notifications.trigger.ts — Mantenimiento de la bandeja (Tanda 2 / B3).
 *
 * La bandeja es para lo reciente: el histórico largo de hallazgos y eventos ya
 * vive en sus propias tablas. Purgar a los 90 días mantiene el tamaño bajo en
 * el free tier de Supabase, donde el disco es el recurso escaso.
 */

export const NOTIFICATION_RETENTION_DAYS = 90;

export const notificationsMaintenance = schedules.task({
  id: "notifications-maintenance",
  cron: "0 3 * * *",
  retry: { maxAttempts: 2 },
  run: async (payload) => {
    console.log(`[NotificationsMaintenance] Inicio ${payload.timestamp.toISOString()}`);

    const purged = await purgeOldNotifications(NOTIFICATION_RETENTION_DAYS);

    console.log(
      `[NotificationsMaintenance] Fin: retención=${NOTIFICATION_RETENTION_DAYS}d purgadas=${purged}`,
    );

    return {
      success: true,
      purged,
      retentionDays: NOTIFICATION_RETENTION_DAYS,
      timestamp: payload.timestamp.toISOString(),
    };
  },
});
