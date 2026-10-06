import { task } from "@trigger.dev/sdk";
import type { CronJobPayload } from "./cron-plan";
import { runWeeklyDigest } from "@/server/security/weekly-digest";
import { logger } from "@/lib/logger";

export const weeklyDigestTask = task({
  id: "weekly-digest",
  // Lunes 09:00 UTC: resumen ejecutivo semanal por proyecto.
  // Sin cron propio: el free tier de Trigger.dev permite 10 schedules y
  // esta task la dispara "weekly-monday-dispatcher" (ver cron-dispatchers.trigger.ts).
  // Cron original: "0 9 * * 1"
  retry: { maxAttempts: 3 },
  run: async (payload: CronJobPayload) => {
    logger.info(`[WeeklyDigest] Iniciando: ${payload.timestamp}`);
    const result = await runWeeklyDigest();
    logger.info(
      `[WeeklyDigest] Listo: ${result.projects} proyectos, ${result.sent} enviados, ${result.failed} fallidos.`
    );
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  },
});
