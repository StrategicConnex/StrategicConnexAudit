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

export const continuousDiscovery = schedules.task({
  id: "continuous-discovery",
  cron: "0 */6 * * *",
  run: async (payload) => {
    console.log(`[Discovery Trigger] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)));

    console.log(`[Discovery Trigger] ${activeProjects.length} active projects.`);

    const results = [];

    for (const project of activeProjects) {
      try {
        console.log(`[Discovery] Running for ${project.name} (${project.domain})`);

        const result = await runDiscovery({
          domain: project.domain,
          projectId: project.id,
          timeoutMs: 120_000,
          dnsBruteForce: true,
          ctMonitor: true,
          shadowDetection: true,
        });

        results.push({
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
        });

        console.log(
          `[Discovery] ${project.domain}: ${result.totalNewAssets} new, ` +
          `${result.totalChanges} changes.`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Discovery] Error in ${project.name}:`, msg);
        results.push({
          projectId: project.id,
          domain: project.domain,
          error: msg,
          newAssets: 0,
          totalChanges: 0,
          modules: [],
        });
      }
    }

    const totalNew = results.reduce((sum, r) => sum + (r.newAssets || 0), 0);
    const errors = results.filter((r) => r.error);
    const successCount = results.length - errors.length;

    console.log(
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
