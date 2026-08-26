/**
 * trigger/mitre-evaluation.trigger.ts
 *
 * Evaluación Real de Cobertura MITRE: checks reales por técnica + agente AI
 * (veredictos, playbooks manuales y resumen ejecutivo). Job largo — Trigger.dev.
 */

import { task } from "@trigger.dev/sdk/v3";
import { executeMitreEvaluation } from "@/server/intelligence/adversary/mitre-eval/mitre-service";

export interface MitreEvaluationPayload {
  evaluationId: string;
}

export const runMitreEvaluationTask = task({
  id: "mitre-real-evaluation",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: MitreEvaluationPayload) => {
    console.log(`[MitreReal] Iniciando evaluación MITRE ${payload.evaluationId}`);
    await executeMitreEvaluation(payload.evaluationId);
    console.log(`[MitreReal] Evaluación ${payload.evaluationId} finalizada`);
    return { ok: true };
  },
});
