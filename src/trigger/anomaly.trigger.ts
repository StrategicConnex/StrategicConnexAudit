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
import { isNull } from "drizzle-orm";

export const periodicAnomalyDetection = schedules.task({
  id: "periodic-anomaly-detection",
  cron: "*/15 * * * *",
  run: async (payload) => {
    console.log(`[AnomalyDetector] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt));

    console.log(`[AnomalyDetector] ${activeProjects.length} active projects.`);

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
          console.log(
            `[AnomalyDetector] ${project.domain}: ${totalAnomalies} anomalías detectadas.`
          );
        }
      } catch (err: any) {
        console.error(`[AnomalyDetector] Error in ${project.name}:`, err.message);
        summaries.push({
          projectId: project.id,
          domain: project.domain,
          error: err.message,
          metricCount: 0,
          totalAnomalies: 0,
          results: [],
        });
      }
    }

    const totalAnomaliesAll = summaries.reduce((sum, r) => sum + r.totalAnomalies, 0);
    const errors = summaries.filter((r) => r.error);
    const successCount = summaries.length - errors.length;

    console.log(
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
