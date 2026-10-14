import { task } from "@trigger.dev/sdk";
import type { CronJobPayload } from "./cron-plan";
import { db } from "@/shared/db";
import { uptimeLogs, webVitalsLogs, heatmapSessions, securityAuditLogs } from "@/shared/db/schemas";
import { appLogs, intelligenceRunEvents, intelligenceToolRuns, intelligenceUsageEvents } from "@/shared/db/schemas";
import { lt } from "drizzle-orm";

export const cleanupOldLogs = task({
  id: "cleanup-old-logs",
  // Sin cron propio: el free tier de Trigger.dev permite 10 schedules y
  // esta task la dispara "daily-operations-dispatcher" (ver cron-dispatchers.trigger.ts).
  // Cron original: "0 0 * * *"
  retry: { maxAttempts: 3 },
  run: async (_payload: CronJobPayload) => {
    console.log("[Cleanup] Iniciando purga de registros antiguos (>30 días)");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // P1-5: PII de sesiones (heatmap) 90d; logs de seguridad 365d.
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);

    try {
      const deletedUptime = await db.delete(uptimeLogs)
        .where(lt(uptimeLogs.checkedAt, thirtyDaysAgo));

      const deletedVitals = await db.delete(webVitalsLogs)
        .where(lt(webVitalsLogs.recordedAt, thirtyDaysAgo));

      const deletedHeatmap = await db.delete(heatmapSessions)
        .where(lt(heatmapSessions.recordedAt, ninetyDaysAgo));

      const deletedSecAudit = await db.delete(securityAuditLogs)
        .where(lt(securityAuditLogs.createdAt, yearAgo));

      // P2-14: Retención para tablas de inteligencia (30 días)
      const deletedAppLogs = await db.delete(appLogs)
        .where(lt(appLogs.createdAt, thirtyDaysAgo));

      const deletedRunEvents = await db.delete(intelligenceRunEvents)
        .where(lt(intelligenceRunEvents.createdAt, thirtyDaysAgo));

      const deletedToolRuns = await db.delete(intelligenceToolRuns)
        .where(lt(intelligenceToolRuns.createdAt, thirtyDaysAgo));

      const deletedUsageEvents = await db.delete(intelligenceUsageEvents)
        .where(lt(intelligenceUsageEvents.createdAt, thirtyDaysAgo));

      console.log(
        "[Cleanup] Purga completada. Uptime: %d filas, Vitals: %d filas, Heatmap: %d filas, SecAudit: %d filas",
        deletedUptime.rowCount,
        deletedVitals.rowCount,
        deletedHeatmap.rowCount,
        deletedSecAudit.rowCount
      );
      console.log(
        "[Cleanup] Retención: app_logs=%d, intelligence_run_events=%d, intelligence_tool_runs=%d, intelligence_usage_events=%d",
        deletedAppLogs.rowCount,
        deletedRunEvents.rowCount,
        deletedToolRuns.rowCount,
        deletedUsageEvents.rowCount
      );

      return {
        success: true,
        uptimeDeleted: deletedUptime.rowCount,
        vitalsDeleted: deletedVitals.rowCount,
        heatmapDeleted: deletedHeatmap.rowCount,
        secAuditDeleted: deletedSecAudit.rowCount,
        appLogsDeleted: deletedAppLogs.rowCount,
        intelligenceRunEventsDeleted: deletedRunEvents.rowCount,
        intelligenceToolRunsDeleted: deletedToolRuns.rowCount,
        intelligenceUsageEventsDeleted: deletedUsageEvents.rowCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[Cleanup] Error durante la purga de logs:", error);
      throw error;
    }
  },
});