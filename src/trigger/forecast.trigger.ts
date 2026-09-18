import { schedules } from "@trigger.dev/sdk";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/shared/db";
import {
  projects,
  forecasts,
  type ForecastMetric,
} from "@/shared/db/schemas";
import { linearForecast } from "@/server/intelligence/anomaly/forecast-math";
import { mapLimit } from "@/shared/lib/map-limit";
import { logger } from "@/lib/logger";

const HORIZON_DAYS = 14;
const WINDOW_DAYS = 30;

/** Promedios diarios (UTC) de una serie [fecha, valor]. */
function dailyAverages(rows: Array<{ day: string; avg: string | number | null }>): number[] {
  return rows
    .map((r) => Number(r.avg))
    .filter((v) => Number.isFinite(v));
}

async function forecastProject(projectId: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);

  const [latencyRows, downRows, rankRows] = await Promise.all([
    db.execute<{ day: string; avg: string | null }>(sql`
      SELECT date_trunc('day', checked_at)::date::text AS day,
             AVG(response_time_ms)::float8 AS avg
      FROM uptime_logs
      WHERE project_id = ${projectId} AND checked_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute<{ day: string; avg: string | null }>(sql`
      SELECT date_trunc('day', checked_at)::date::text AS day,
             AVG(CASE WHEN is_up THEN 0 ELSE 1 END)::float8 AS avg
      FROM uptime_logs
      WHERE project_id = ${projectId} AND checked_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute<{ day: string; avg: string | null }>(sql`
      SELECT r.checked_at::date::text AS day,
             AVG(r.position)::float8 AS avg
      FROM rank_history r
      JOIN keyword_targets k ON k.id = r.keyword_id
      WHERE k.project_id = ${projectId} AND r.checked_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const metrics: Array<{ metric: ForecastMetric; values: number[] }> = [
    { metric: "latency_ms", values: dailyAverages(latencyRows.rows ?? []) },
    { metric: "uptime_risk", values: dailyAverages(downRows.rows ?? []) },
    { metric: "keyword_position", values: dailyAverages(rankRows.rows ?? []) },
  ];

  for (const { metric, values } of metrics) {
    const f = linearForecast({ dailyAverages: values, horizonDays: HORIZON_DAYS });
    await db
      .insert(forecasts)
      .values({
        projectId,
        metric,
        currentValue: String(f.current),
        predictedValue: String(f.predicted),
        horizonDays: HORIZON_DAYS,
        confidence: String(Math.round(f.rSquared * 10000) / 10000),
        sampleDays: f.sampleDays,
        metadata: { trend: f.trend, slopePerDay: f.slopePerDay },
      })
      .onConflictDoUpdate({
        target: [forecasts.projectId, forecasts.metric],
        set: {
          currentValue: String(f.current),
          predictedValue: String(f.predicted),
          confidence: String(Math.round(f.rSquared * 10000) / 10000),
          sampleDays: f.sampleDays,
          metadata: { trend: f.trend, slopePerDay: f.slopePerDay },
          updatedAt: new Date(),
        },
      });
  }
}

export const forecastTask = schedules.task({
  id: "weekly-forecast",
  // Lunes 06:00 UTC: predicción a 14 días por proyecto.
  cron: "0 6 * * 1",
  retry: { maxAttempts: 3 },
  run: async (payload) => {
    logger.info(`[Forecast] Iniciando: ${payload.timestamp}`);

    const activeProjects = await db
      .select({ id: projects.id, domain: projects.domain })
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    const results = await mapLimit(activeProjects, 5, async (project) => {
      try {
        await forecastProject(project.id);
        return { projectId: project.id, ok: true as const };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Forecast] Error en ${project.domain}:`, msg);
        return { projectId: project.id, ok: false as const, error: msg };
      }
    });

    const ok = results.filter((r) => r.ok).length;
    logger.info(`[Forecast] Listo: ${ok}/${activeProjects.length} proyectos.`);
    return {
      processed: activeProjects.length,
      successCount: ok,
      errorCount: activeProjects.length - ok,
      timestamp: new Date().toISOString(),
    };
  },
});
