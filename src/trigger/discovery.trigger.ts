/**
 * trigger/discovery.trigger.ts
 * 
 * Continuous Asset Discovery Trigger — runs every 6 hours
 * via Trigger.dev scheduled task for all active projects.
 */

import { schedules } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { runDiscovery } from "@/server/intelligence/discovery/orchestrator";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { mapLimit } from "@/shared/lib/map-limit";

export const continuousDiscovery = schedules.task({
  id: "continuous-discovery",
  cron: "0 */6 * * *",
  retry: { maxAttempts: 3 },
  run: async (payload) => {
    logger.info(`[Discovery Trigger] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    logger.info(`[Discovery Trigger] ${activeProjects.length} active projects.`);

    // P2-3: concurrencia acotada (5) en vez de secuencial puro — cada
    // proyecto ya aísla sus errores en try/catch, el orden se preserva.
    interface DiscoverySummary {
      projectId: string;
      domain: string;
      error?: string;
      newAssets: number;
      totalChanges: number;
      modules: Array<{
        moduleId: string;
        success: boolean;
        assetCount: number;
        durationMs: number;
      }>;
    }
    const results = await mapLimit(activeProjects, 5, async (project): Promise<DiscoverySummary> => {
      try {
        logger.info(`[Discovery] Running for ${project.name} (${project.domain})`);

        const result = await runDiscovery({
          domain: project.domain,
          projectId: project.id,
          timeoutMs: 120_000,
          dnsBruteForce: true,
          ctMonitor: true,
          shadowDetection: true,
        });

        logger.info(
          `[Discovery] ${project.domain}: ${result.totalNewAssets} new, ` +
          `${result.totalChanges} changes.`
        );

        return {
          projectId: project.id,
          domain: project.domain,
          newAssets: result.totalNewAssets,
          totalChanges: result.totalChanges,
          modules: result.modules.map((m) => ({
            moduleId: m.moduleId,
            success: m.success,
            assetCount: m.assets.length,
            durationMs: m.durationMs,
          })),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Discovery] Error in ${project.name}:`, msg);
        return {
          projectId: project.id,
          domain: project.domain,
          error: msg,
          newAssets: 0,
          totalChanges: 0,
          modules: [],
        };
      }
    });

    const totalNew = results.reduce((sum, r) => sum + (r.newAssets || 0), 0);
    const errors = results.filter((r) => r.error);
    const successCount = results.length - errors.length;

    logger.info(
      `[Discovery] Done: ${successCount}/${activeProjects.length} OK, ` +
      `${totalNew} new assets, ${errors.length} errors.`
    );

    return {
      processed: activeProjects.length,
      successCount,
      errorCount: errors.length,
      totalNewAssets: totalNew,
      results,
      timestamp: new Date().toISOString(),
    };
  },
});
