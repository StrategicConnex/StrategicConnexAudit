import { logger, schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/shared/db";
import { monitoringSchedules, monitoringAlerts, projects } from "@/shared/db/schemas";
import { eq, inArray } from "drizzle-orm";
import { executeTool } from "@/server/intelligence/core/dispatcher";

// Tarea programada que evalúa los monitores activos
export const evaluateMonitorsTask = schedules.task({
  id: "evaluate-monitors-task",
  // Se ejecutaría según la configuración cron, por ejemplo diario a las 00:00
  // Aquí usamos un patrón de ejemplo para la definición del schedule trigger
  cron: "0 0 * * *", 
  run: async (payload) => {
    logger.info("Iniciando evaluación de monitores de seguridad", { timestamp: payload.timestamp.toISOString() });

    // Obtener todos los schedules activos que deberían ejecutarse
    const activeMonitors = await db.query.monitoringSchedules.findMany({
      where: eq(monitoringSchedules.enabled, true),
    });

    logger.info(`Se encontraron ${activeMonitors.length} monitores activos`);

    if (activeMonitors.length === 0) {
      return { evaluated: 0 };
    }

    // PERF: resolver todos los proyectos en UNA query (antes había un
    // findFirst dentro del bucle — N+1)
    const projectIds = [...new Set(activeMonitors.map((m) => m.projectId))];
    const projectRows = await db
      .select({ id: projects.id, domain: projects.domain, ownerId: projects.ownerId })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    const projectsById = new Map(projectRows.map((p) => [p.id, p]));

    for (const monitor of activeMonitors) {
      try {
        // 1. Simular la ejecución de una herramienta específica para el monitor
        // En una implementación completa, monitoringSchedules tendría toolId y target.
        // Simularemos con toolId="tls.scan" y un target genérico del proyecto
        const project = projectsById.get(monitor.projectId);

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

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Error evaluando monitor ${monitor.id}: ${errorMessage}`);
      }
    }

    return { evaluated: activeMonitors.length };
  },
});
