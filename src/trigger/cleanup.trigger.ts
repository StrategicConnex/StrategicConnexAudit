import { schedules } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { uptimeLogs, webVitalsLogs } from "@/shared/db/schemas";
import { lt } from "drizzle-orm";

export const cleanupOldLogs = schedules.task({
  id: "cleanup-old-logs",
  cron: "0 0 * * *", // Ejecutar cada medianoche
  run: async (payload) => {
    console.log("[Cleanup] Iniciando purga de registros antiguos (>30 días)");
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const deletedUptime = await db.delete(uptimeLogs)
        .where(lt(uptimeLogs.checkedAt, thirtyDaysAgo));
      
      const deletedVitals = await db.delete(webVitalsLogs)
        .where(lt(webVitalsLogs.recordedAt, thirtyDaysAgo));

      console.log(`[Cleanup] Purga completada. Uptime: ${deletedUptime.rowCount} filas, Vitals: ${deletedVitals.rowCount} filas.`);
      
      return {
        success: true,
        uptimeDeleted: deletedUptime.rowCount,
        vitalsDeleted: deletedVitals.rowCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("[Cleanup] Error durante la purga de logs:", error);
      throw error;
    }
  },
});
