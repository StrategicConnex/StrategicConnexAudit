import { schedules, wait } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { projects, uptimeLogs } from "@/shared/db/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { validateSafeUrl, normalizeUrl, safeFetchFollow } from "@/server/intelligence/security/egress-guard";

interface UptimeCheck {
  projectId: string;
  isUp: boolean;
  statusCode: number;
  responseTimeMs: number;
  errorMessage: string | null;
}

export const uptimeMonitor = schedules.task({
  id: "uptime-monitor",
  cron: "*/15 * * * *", // Cada 15 minutos
  retry: { maxAttempts: 3 },
  run: async (payload) => {
    console.log(`[Uptime] Iniciando ciclo de monitoreo: ${payload.timestamp}`);

    // 1. Obtener todos los proyectos activos
    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    console.log(`[Uptime] Monitoreando ${activeProjects.length} proyectos.`);

    // 2. Procesar cada proyecto (secuencial para evitar picos de carga en el plan Hobby)
    const checks: UptimeCheck[] = [];
    const domainById = new Map(activeProjects.map((p) => [p.id, p.domain]));

    for (const project of activeProjects) {
      const startTime = Date.now();
      let isUp = false;
      let statusCode = 0;
      let errorMessage: string | null = null;

      try {
        const targetUrl = normalizeUrl(project.domain);
        await validateSafeUrl(targetUrl);

        // P2-4: safeFetchFollow revalida CADA salto de redirect (cierra
        // DNS-rebinding entre validateSafeUrl y fetch, y entre saltos).
        const response = await safeFetchFollow(targetUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'StrategicAudit-UptimeBot/1.0',
          },
          signal: AbortSignal.timeout(10000), // 10 segundos de timeout
        });

        statusCode = response.status;
        isUp = response.status >= 200 && response.status < 400;
      } catch (err: unknown) {
        const error = err as Error;
        isUp = false;
        errorMessage = error.message || "Error de conexión";
        console.error(`[Uptime] Fallo en ${project.domain}:`, errorMessage);
      }

      checks.push({
        projectId: project.id,
        isUp,
        statusCode,
        responseTimeMs: Date.now() - startTime,
        errorMessage,
      });

      // Breve espera para no saturar
      await wait.for({ seconds: 1 });
    }

    // 3. Estado previo de los proyectos caídos — ANTES del insert batch,
    //    para distinguir transición up→down de "sigue caído". 1 query fija
    //    (antes: 1 select + 1 insert POR proyecto).
    const downChecks = checks.filter((c) => !c.isUp);
    const previousUp = new Map<string, boolean>();
    let previousStateOk = downChecks.length === 0;
    if (downChecks.length > 0) {
      try {
        const prevResult = await db.execute(sql`
          SELECT DISTINCT ON (project_id) project_id, is_up
          FROM uptime_logs
          WHERE project_id IN ${downChecks.map((c) => c.projectId)}
          ORDER BY project_id, checked_at DESC
        `);
        for (const row of (prevResult.rows ?? []) as Array<{ project_id: string; is_up: boolean }>) {
          previousUp.set(row.project_id, row.is_up);
        }
        previousStateOk = true;
      } catch {
        // Sin estado previo no se emiten eventos down (evita falsos positivos).
      }
    }

    // 4. Insert batcheado: UNA sola sentencia para todo el ciclo.
    if (checks.length > 0) {
      await db.insert(uptimeLogs).values(checks);
    }

    // B-3: evento uptime.down SOLO en transición (up→down), no en cada ciclo caído.
    if (previousStateOk) {
      for (const check of downChecks) {
        const wasUp = previousUp.get(check.projectId) ?? true;
        if (!wasUp) continue;
        try {
          const { emitProjectEvent } = await import("@/server/lib/project-events");
          await emitProjectEvent(check.projectId, "uptime.down", {
            domain: domainById.get(check.projectId),
            statusCode: check.statusCode,
            responseTimeMs: check.responseTimeMs,
            errorMessage: check.errorMessage,
          });
        } catch {
          // La notificación nunca rompe el monitoreo.
        }
      }
    }

    return {
      processed: activeProjects.length,
      timestamp: new Date().toISOString()
    };
  },
});
