import { task, schedules } from "@trigger.dev/sdk";
import { directDb } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { runFindingTriageSweep, TRIAGE_BATCH_SIZE } from "@/server/ai/finding-triage";

/**
 * finding-triage.trigger.ts — Triage IA de findings (Sprint 2, roadmap).
 *
 * Dos entradas:
 *
 * 1. `triage-after-audit` (task): se encola al finalizar una auditoría
 *    (`run-project-audit`) para clasificar los hallazgos que esa ejecución
 *    generó. Disparo con debounce 60s: si varios jobs terminan seguidos del
 *    mismo proyecto, un único sweep los cubre todos.
 *
 * 2. `finding-triage-sweep` (schedule diario 04:00 UTC): barrido de todos los
 *    proyectos con findings pendientes — recupera los que quedaron sin
 *    clasificar por rate limit, timeout o key ausente en su momento.
 *
 * El triage es fire-and-forget: un fallo de IA nunca marca la auditoría como
 * fallida ni rompe el pipeline del scan.
 */

export const triageAfterAudit = task({
  id: "triage-after-audit",
  retry: { maxAttempts: 3 },
  run: async (payload: { projectId: string; userId?: string | null }) => {
    const { projectId, userId } = payload;
    console.log(`[Triage] Post-audit para proyecto ${projectId}`);

    const result = await runFindingTriageSweep(projectId, {
      userId: userId ?? null,
      maxCalls: 3,
      batchSize: TRIAGE_BATCH_SIZE,
    });

    console.log(
      `[Triage] Proyecto ${projectId}: updated=${result.updated} calls=${result.calls}` +
        (result.error ? ` error=${result.error.slice(0, 200)}` : "")
    );

    return {
      success: !result.error || result.updated > 0,
      projectId,
      ...result,
    };
  },
});

export const findingTriageSweep = schedules.task({
  id: "finding-triage-sweep",
  cron: "0 4 * * *",
  retry: { maxAttempts: 2 },
  run: async (payload) => {
    console.log(`[TriageSweep] Inicio ${payload.timestamp.toISOString()}`);

    // Proyectos activos con posible backlog de findings. El sweep es diario
    // y el techo de llamadas por proyecto protege la cuota.
    const rows = await directDb
      .select({ id: projects.id })
      .from(projects)
      .limit(500);

    const perProject: Array<{
      projectId: string;
      updated: number;
      calls: number;
      error?: string;
    }> = [];
    let failures = 0;

    for (const p of rows) {
      try {
        const r = await runFindingTriageSweep(p.id, {
          userId: null, // ejecución de sistema: sin atribución de cuota
          maxCalls: 4,
          batchSize: TRIAGE_BATCH_SIZE,
        });
        perProject.push({
          projectId: p.id,
          updated: r.updated,
          calls: r.calls,
          ...(r.error ? { error: r.error.slice(0, 300) } : {}),
        });
        if (r.error && r.updated === 0) failures++;
      } catch (err) {
        failures++;
        perProject.push({
          projectId: p.id,
          updated: 0,
          calls: 0,
          error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        });
      }
    }

    const totalUpdated = perProject.reduce((a, r) => a + r.updated, 0);
    console.log(
      `[TriageSweep] Fin: proyectos=${perProject.length} actualizados=${totalUpdated} fallos=${failures}`
    );

    return {
      success: true,
      projectsScanned: perProject.length,
      findingsUpdated: totalUpdated,
      failures,
      perProject,
      timestamp: payload.timestamp.toISOString(),
    };
  },
});
