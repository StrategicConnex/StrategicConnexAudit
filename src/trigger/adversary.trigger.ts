/**
 * trigger/adversary.trigger.ts
 *
 * Periodic Adversary Simulation — runs every 6 hours via Trigger.dev
 * for all active projects. Executes safe MITRE ATT&CK simulation
 * scenarios and records results for detection coverage tracking.
 */

import { schedules } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { ADVERSARY_CATALOG } from "@/server/intelligence/adversary/catalog";
import { runScenario } from "@/server/intelligence/adversary/scenario-runner";
import { isNull } from "drizzle-orm";

const SCHEDULED_SCENARIOS = [
  "T1078.001",
  "T1046",
  "T1021.001",
  "T1530",
  "T1490",
];

export const periodicAdversarySimulation = schedules.task({
  id: "periodic-adversary-simulation",
  cron: "0 */6 * * *",
  run: async (payload) => {
    console.log(`[AdversaryTrigger] Starting: ${payload.timestamp}`);

    const activeProjects = await db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt));

    console.log(`[AdversaryTrigger] ${activeProjects.length} active projects.`);

    type Summary = {
      projectId: string;
      domain: string;
      scenariosRun: number;
      scenariosPassed: number;
      scenariosFailed: number;
      scoreImpacts: number[];
      error?: string;
    };

    const summaries: Summary[] = [];

    for (const project of activeProjects) {
      try {
        let scenariosRun = 0;
        let scenariosPassed = 0;
        let scenariosFailed = 0;
        const scoreImpacts: number[] = [];

        for (const mitreId of SCHEDULED_SCENARIOS) {
          const def = ADVERSARY_CATALOG.find((s) => s.mitreId === mitreId);
          if (!def) continue;
          if (def.executorType === "powershell" || def.executorType === "bash") continue;

          console.log(`[AdversaryTrigger] Running ${mitreId} for ${project.domain}`);

          const result = await runScenario({
            scenarioMitreId: mitreId,
            projectId: project.id,
          });

          if (result.success) {
            scenariosRun++;
            if (result.result === "detected") scenariosPassed++;
            else scenariosFailed++;
            if (result.scoreImpact) scoreImpacts.push(result.scoreImpact);
          } else {
            scenariosRun++;
            scenariosFailed++;
          }
        }

        summaries.push({
          projectId: project.id,
          domain: project.domain,
          scenariosRun,
          scenariosPassed,
          scenariosFailed,
          scoreImpacts,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[AdversaryTrigger] Error in ${project.name}: ${msg}`);
        summaries.push({
          projectId: project.id,
          domain: project.domain,
          error: msg,
          scenariosRun: 0,
          scenariosPassed: 0,
          scenariosFailed: 0,
          scoreImpacts: [],
        });
      }
    }

    const totalRun = summaries.reduce((s, r) => s + r.scenariosRun, 0);
    const totalPassed = summaries.reduce((s, r) => s + r.scenariosPassed, 0);
    const totalFailed = summaries.reduce((s, r) => s + r.scenariosFailed, 0);
    const errors = summaries.filter((r) => r.error);
    const successCount = summaries.length - errors.length;

    console.log(
      `[AdversaryTrigger] Done: ${successCount}/${activeProjects.length} OK, ` +
      `${totalRun} scenarios (${totalPassed} passed, ${totalFailed} failed), ${errors.length} errors.`
    );

    return {
      processed: activeProjects.length,
      successCount,
      errorCount: errors.length,
      totalScenariosRun: totalRun,
      totalPassed,
      totalFailed,
      summaries,
      timestamp: new Date().toISOString(),
    };
  },
});
