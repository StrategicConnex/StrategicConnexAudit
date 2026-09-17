import { schedules } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { uptimeLogs, webVitalsLogs, heatmapSessions, securityAuditLogs } from "@/shared/db/schemas";
import { lt } from "drizzle-orm";

export const cleanupOldLogs = schedules.task({
  id: "cleanup-old-logs",
  cron: "0 0 * * *", // Ejecutar cada medianoche
  retry: { maxAttempts: 3 },
  run: async () => {
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

      console.log(`[Cleanup] Purga completada. Uptime: ${deletedUptime.rowCount} filas, Vitals: ${deletedVitals.rowCount} filas, Heatmap: ${deletedHeatmap.rowCount} filas, SecAudit: ${deletedSecAudit.rowCount} filas.`);
      
      return {
        success: true,
        uptimeDeleted: deletedUptime.rowCount,
        vitalsDeleted: deletedVitals.rowCount,
        heatmapDeleted: deletedHeatmap.rowCount,
        secAuditDeleted: deletedSecAudit.rowCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("[Cleanup] Error durante la purga de logs:", error);
      throw error;
    }
  },
});
