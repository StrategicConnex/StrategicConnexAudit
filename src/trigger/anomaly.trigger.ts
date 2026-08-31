/**
 * trigger/anomaly.trigger.ts
 *
 * Periodic Anomaly Detection — runs every 15 minutes via Trigger.dev
 * for all active projects. Executes the statistical detector engine
 * and persists findings to anomaly_detections table.
 */

import { schedules } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { runAllDetections } from "@/server/intelligence/anomaly/detector";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const periodicAnomalyDetection = schedules.task({
  id: "periodic-anomaly-detection",
  cron: "*/15 * * * *",
  run: async (payload) => {
    logger.info(`[AnomalyDetector] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    logger.info(`[AnomalyDetector] ${activeProjects.length} active projects.`);

    const summaries = [];

    for (const project of activeProjects) {
      try {
        const results = await runAllDetections(project.id, { windowHours: 24 });

        const totalAnomalies = results.reduce((sum, r) => sum + r.anomalies, 0);

        summaries.push({
          projectId: project.id,
          domain: project.domain,
          metricCount: results.length,
          totalAnomalies,
          results,
        });

        if (totalAnomalies > 0) {
          logger.info(
            `[AnomalyDetector] ${project.domain}: ${totalAnomalies} anomalías detectadas.`
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[AnomalyDetector] Error in ${project.name}:`, msg);
        summaries.push({
          projectId: project.id,
          domain: project.domain,
          error: msg,
          metricCount: 0,
          totalAnomalies: 0,
          results: [],
        });
      }
    }

    const totalAnomaliesAll = summaries.reduce((sum, r) => sum + r.totalAnomalies, 0);
    const errors = summaries.filter((r) => r.error);
    const successCount = summaries.length - errors.length;

    logger.info(
      `[AnomalyDetector] Done: ${successCount}/${activeProjects.length} OK, ` +
      `${totalAnomaliesAll} anomalías, ${errors.length} errors.`
    );

    return {
      processed: activeProjects.length,
      successCount,
      errorCount: errors.length,
      totalAnomalies: totalAnomaliesAll,
      summaries,
      timestamp: new Date().toISOString(),
    };
  },
});
