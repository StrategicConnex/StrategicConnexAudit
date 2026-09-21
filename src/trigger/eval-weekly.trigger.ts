import { schedules, task } from "@trigger.dev/sdk";
import {
  runModelEval,
  proposeAdversaryChain,
  EVAL_MODELS,
} from "@/server/ai/eval-runner";

/**
 * eval-weekly.trigger.ts — Eval continuo del pool (Sprint 4, idea #8).
 *
 * Dos entradas:
 *
 * 1. `eval-pool` (task): ejecuta el golden dataset contra UN modelo (o todos
 *    con `all: true`) y persiste cada fila con su prompt_version. Manual
 *    (botón del dashboard) o invocado por la rotación semanal.
 *
 * 2. `eval-pool-weekly` (schedules): rotación semanal — cada domingo evalúa
 *    un SUBCONJUNTO distinto de modelos (offset = nº de semana % total) para
 *    repartir el coste de llamadas :free. Al terminar propone cambios de
 *    cadena con guardrail y lo deja registrado en el run log (revisión
 *    humana; nunca toca TASK_ROUTING automáticamente).
 */

export const evalPool = task({
  id: "eval-pool",
  maxDuration: 900,
  run: async (payload: { model?: string; all?: boolean; maxCases?: number }) => {
    const models =
      payload.all || !payload.model ? EVAL_MODELS : [payload.model];
    const summary: Array<{ model: string; okCalls: number; avgScore: number }> = [];

    for (const model of models) {
      const res = await runModelEval(model, {
        cases: payload.maxCases
          ? undefined
          : undefined, // dataset completo; maxCases se acota en el runner manual
      });
      summary.push({ model, okCalls: res.okCalls, avgScore: res.avgScore });
    }
    return { promptVersionSeries: "ver ai_eval_results", summary };
  },
});

export const evalPoolWeekly = schedules.task({
  id: "eval-pool-weekly",
  cron: "0 6 * * 0", // domingos 06:00 UTC
  maxDuration: 1800,
  run: async () => {
    // Rotación: cada semana un subconjunto (2 modelos) distinto del pool.
    const week = Math.floor(Date.now() / (7 * 86_400_000));
    const size = 2;
    const start = (week * size) % EVAL_MODELS.length;
    const models = Array.from(
      { length: Math.min(size, EVAL_MODELS.length) },
      (_, i) => EVAL_MODELS[(start + i) % EVAL_MODELS.length]
    ).filter((m): m is string => !!m);

    const summary: Array<{ model: string; okCalls: number; avgScore: number }> = [];
    for (const model of models) {
      const res = await runModelEval(model);
      summary.push({ model, okCalls: res.okCalls, avgScore: res.avgScore });
    }

    // Propuesta con guardrail (revisión humana; no muta TASK_ROUTING).
    const proposal = await proposeAdversaryChain({ minRuns: 10, days: 45 });

    console.log("[eval-weekly] modelos evaluados:", summary);
    console.log("[eval-weekly] propuesta de cadena:", JSON.stringify(proposal, null, 2));

    return { evaluated: models, summary, chainProposal: proposal };
  },
});
