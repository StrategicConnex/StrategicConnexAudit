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
import { callAIWithFallback } from "@/server/ai/ai-router";
import { mapLimit } from "@/shared/lib/map-limit";

export const periodicAnomalyDetection = schedules.task({
  id: "periodic-anomaly-detection",
  cron: "*/15 * * * *",
  retry: { maxAttempts: 3 },
  run: async (payload) => {
    logger.info(`[AnomalyDetector] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    logger.info(`[AnomalyDetector] ${activeProjects.length} active projects.`);

    // P2-3: concurrencia acotada (5); cada proyecto aísla sus errores.
    interface AnomalySummary {
      projectId: string;
      domain: string;
      error?: string;
      metricCount: number;
      totalAnomalies: number;
      narrative: string | null;
      results: unknown[];
    }
    const summaries = await mapLimit(activeProjects, 5, async (project): Promise<AnomalySummary> => {
      try {
        const results = await runAllDetections(project.id, { windowHours: 24 });

        const totalAnomalies = results.reduce((sum, r) => sum + r.anomalies, 0);

        // P2-2 narrativa IA: solo cuando hay algo que contar (volumen acotado:
        // 1 llamada corta por proyecto con anomalías, sin usuario atribuido).
        let narrative: string | null = null;
        if (totalAnomalies > 0) {
          try {
            const digest = results
              .filter((r) => r.anomalies > 0)
              .slice(0, 8)
              .map((r) => `- ${r.metricType}: ${r.anomalies} anomalía(s)${r.severity ? `, severidad ${r.severity}` : ""}`)
              .join("\n");
            const ai = await callAIWithFallback({
              taskType: "anomaly-narrative",
              messages: [
                {
                  role: "system",
                  content: "Eres un analista de monitoreo. Con la síntesis estadística dada, redacta en español 2-3 líneas: causa probable y primera acción. Sin jerga innecesaria, sin inventar datos.",
                },
                {
                  role: "user",
                  content: `Dominio: ${project.domain}\nAnomalías (24h):\n${digest}`,
                },
              ],
              temperature: 0.2,
              maxTokens: 300,
            });
            if (ai.success && ai.content) narrative = ai.content.slice(0, 600);
          } catch (narrErr) {
            logger.warn(`[AnomalyDetector] narrativa IA falló para ${project.domain}`, {
              error: narrErr instanceof Error ? narrErr.message : String(narrErr),
            });
          }
        }

        if (totalAnomalies > 0) {
          logger.info(
            `[AnomalyDetector] ${project.domain}: ${totalAnomalies} anomalías detectadas.`
          );
          // B-3: evento saliente para Zapier/Make/webhooks suscritos.
          try {
            const { emitProjectEvent } = await import("@/server/lib/project-events");
            await emitProjectEvent(project.id, "anomaly.detected", {
              domain: project.domain,
              totalAnomalies,
              narrative,
            });
          } catch {
            // La notificación nunca rompe la detección.
          }
        }

        return {
          projectId: project.id,
          domain: project.domain,
          metricCount: results.length,
          totalAnomalies,
          narrative,
          results,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[AnomalyDetector] Error in ${project.name}:`, msg);
        return {
          projectId: project.id,
          domain: project.domain,
          error: msg,
          metricCount: 0,
          totalAnomalies: 0,
          narrative: null as string | null,
          results: [],
        };
      }
    });

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
