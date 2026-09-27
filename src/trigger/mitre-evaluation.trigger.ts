/**
 * trigger/mitre-evaluation.trigger.ts
 *
 * Evaluación Real de Cobertura MITRE: checks reales por técnica + agente AI
 * (veredictos, playbooks manuales y resumen ejecutivo). Job largo — Trigger.dev.
 */

import { task } from "@trigger.dev/sdk/v3";
import { executeMitreEvaluation } from "@/server/intelligence/adversary/mitre-eval/mitre-service";
import { runWithCorrelation } from "@/lib/request-context";

export interface MitreEvaluationPayload {
  evaluationId: string;
  /** G2 — id de correlación de la request que encoló el job (opcional en crons). */
  correlationId?: string;
}

export const runMitreEvaluationTask = task({
  id: "mitre-real-evaluation",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: MitreEvaluationPayload) =>
    runWithCorrelation(payload.correlationId, async () => {
      console.log(`[MitreReal] Iniciando evaluación MITRE ${payload.evaluationId}`);
      await executeMitreEvaluation(payload.evaluationId);
      console.log(`[MitreReal] Evaluación ${payload.evaluationId} finalizada`);
      return { ok: true };
    }),
});
