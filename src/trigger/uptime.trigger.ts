import { schedules, wait } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { projects, uptimeLogs } from "@/shared/db/schemas";
import { eq, isNull, and } from "drizzle-orm";

export const uptimeMonitor = schedules.task({
  id: "uptime-monitor",
  cron: "*/15 * * * *", // Cada 15 minutos
  run: async (payload) => {
    console.log(`[Uptime] Iniciando ciclo de monitoreo: ${payload.scheduleTime}`);

    // 1. Obtener todos los proyectos activos
    const activeProjects = await db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt));

    console.log(`[Uptime] Monitoreando ${activeProjects.length} proyectos.`);

    // 2. Procesar cada proyecto (secuencial para evitar picos de carga en el plan Hobby)
    for (const project of activeProjects) {
      const startTime = Date.now();
      let isUp = false;
      let statusCode = 0;
      let errorMessage: string | null = null;

      try {
        let targetUrl = project.domain;
        if (!/^https?:\/\//i.test(targetUrl)) {
          targetUrl = `https://${targetUrl}`;
        }

        const response = await fetch(targetUrl, {
          method: 'HEAD', // HEAD es más rápido y consume menos ancho de banda
          headers: {
            'User-Agent': 'StrategicAudit-UptimeBot/1.0',
          },
          signal: AbortSignal.timeout(10000), // 10 segundos de timeout
        });

        statusCode = response.status;
        isUp = response.status >= 200 && response.status < 400;
      } catch (err: any) {
        isUp = false;
        errorMessage = err.message || "Error de conexión";
        console.error(`[Uptime] Fallo en ${project.domain}:`, errorMessage);
      }

      const responseTime = Date.now() - startTime;

      // 3. Guardar log de uptime
      await db.insert(uptimeLogs).values({
        projectId: project.id,
        isUp,
        statusCode,
        responseTimeMs: responseTime,
        errorMessage,
      });

      // Breve espera para no saturar
      await wait.for({ seconds: 1 });
    }

    return { 
      processed: activeProjects.length,
      timestamp: new Date().toISOString()
    };
  },
});
