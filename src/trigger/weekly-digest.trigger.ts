import { schedules } from "@trigger.dev/sdk";
import { runWeeklyDigest } from "@/server/security/weekly-digest";
import { logger } from "@/lib/logger";

export const weeklyDigestTask = schedules.task({
  id: "weekly-digest",
  // Lunes 09:00 UTC: resumen ejecutivo semanal por proyecto.
  cron: "0 9 * * 1",
  retry: { maxAttempts: 3 },
  run: async (payload) => {
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
