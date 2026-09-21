import { task } from "@trigger.dev/sdk";
import { runExecBrief } from "@/server/ai/exec-brief";

/**
 * exec-brief.trigger.ts — Resumen ejecutivo post-auditoría (Sprint 3, idea #2).
 *
 * Encolado al final de `run-project-audit` (fire-and-forget): la IA redacta
 * el briefing no técnico y lo persiste en `exec_briefs` para el portal
 * cliente. Un fallo de IA jamás marca la auditoría como fallida.
 *
 * Task efímero (como triage-after-audit del Sprint 2): se dispara desde
 * código, no necesita schedule. El debounce por proyecto coalesce triggers
 * rápidos (varias auditorías seguidas) en una sola generación.
 */
export const execBriefAfterAudit = task({
  id: "exec-brief-after-audit",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (payload: { projectId: string; /** userId opcional para atribuir cuota/telemetría. */ userId?: string | null }) => {
    console.log(`[exec-brief] Generando resumen ejecutivo para proyecto ${payload.projectId}`);

    const result = await runExecBrief(payload.projectId, {
      userId: payload.userId ?? null,
    });

    if (!result.generated) {
      // Sin auditorías completadas o salida inválida del modelo: log y fin
      // limpio (el sweep de reintentos no aplica aquí — el próximo brief
      // llegará con la siguiente auditoría).
      console.log(`[exec-brief] Sin generación: ${result.error ?? "brief vivo ya existente"}`);
      return { ok: false, reason: result.error ?? "brief ya existente" };
    }

    console.log(
      `[exec-brief] Listo: brief=${result.briefId} fallback=${result.isFallback} ` +
        `model=${result.modelUsed ?? "n/d"} cache=${result.fromCache}`
    );
    return {
      ok: true,
      briefId: result.briefId,
      isFallback: result.isFallback,
      modelUsed: result.modelUsed,
      fromCache: result.fromCache,
    };
  },
});
