import { logger, task, schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/shared/db";
import { monitoringSchedules, monitoringAlerts, projects } from "@/shared/db/schemas";
import { eq, and, lt } from "drizzle-orm";
import { executeTool } from "@/server/intelligence/core/dispatcher";

// Tarea programada que evalúa los monitores activos
export const evaluateMonitorsTask = schedules.task({
  id: "evaluate-monitors-task",
  // Se ejecutaría según la configuración cron, por ejemplo diario a las 00:00
  // Aquí usamos un patrón de ejemplo para la definición del schedule trigger
  cron: "0 0 * * *", 
  run: async (payload, { ctx }) => {
    logger.info("Iniciando evaluación de monitores de seguridad");

    const now = new Date();
    
    // Obtener todos los schedules activos que deberían ejecutarse (lastRunAt < hoy o nulo)
    // Para simplificar, buscamos los que están enabled
    const activeMonitors = await db.query.monitoringSchedules.findMany({
      where: eq(monitoringSchedules.enabled, true),
      with: {
        // Asumiendo relaciones en drizzle si se añaden
      }
    });

    logger.info(`Se encontraron ${activeMonitors.length} monitores activos`);

    for (const monitor of activeMonitors) {
      try {
        // 1. Simular la ejecución de una herramienta específica para el monitor
        // En una implementación completa, monitoringSchedules tendría toolId y target.
        // Simularemos con toolId="tls.scan" y un target genérico del proyecto
        // Aquí tomamos un target dummy para mantener el ejemplo robusto
        
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, monitor.projectId)
        });

        if (!project || !project.domain) {
          continue;
        }

        let domainTarget = project.domain;
        try {
          domainTarget = new URL(project.domain.startsWith('http') ? project.domain : `https://${project.domain}`).hostname;
        } catch {
          domainTarget = project.domain;
        }

        // Ejecutar TLS Scan de manera desatendida
        const result = await executeTool(
          "tls.scan",
          domainTarget,
          { host: domainTarget },
          monitor.projectId,
          undefined,
          project.ownerId || undefined
        );

        if (result.success && result.findings) {
          const criticalOrHigh = result.findings.filter(f => f.severity === "high" || f.severity === "critical");
          
          if (criticalOrHigh.length > 0) {
            // Generar una alerta de Drift de Seguridad
            await db.insert(monitoringAlerts).values({
              projectId: monitor.projectId,
              scheduleId: monitor.id,
              title: "Deterioro de Postura de Seguridad (TLS)",
              message: `Se detectaron ${criticalOrHigh.length} problemas de severidad Alta/Crítica en ${domainTarget}.`,
              severity: "critical",
              resolved: false
            });
            
            logger.warn(`Alerta generada para proyecto ${monitor.projectId} en objetivo ${domainTarget}`);
            // (Opcional) Notificar vía email / webhooks
          }
        }

        // Actualizar lastRunAt
        await db.update(monitoringSchedules)
          .set({ lastRunAt: new Date(), updatedAt: new Date() })
          .where(eq(monitoringSchedules.id, monitor.id));

      } catch (err: any) {
        logger.error(`Error evaluando monitor ${monitor.id}: ${err.message}`);
      }
    }

    return { evaluated: activeMonitors.length };
  },
});
