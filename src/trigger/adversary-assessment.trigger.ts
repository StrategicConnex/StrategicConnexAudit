/**
 * trigger/adversary-assessment.trigger.ts
 *
 * Evaluación Real de Adversarios (no destructiva): corre los checks reales
 * contra el dominio autorizado del proyecto y el agente AI de OpenRouter
 * clasifica vulnerabilidades con remediación. Job largo (2-5 min) — por eso
 * vive en Trigger.dev y no en un Route Handler.
 */

import { task } from "@trigger.dev/sdk/v3";
import { executeAssessment } from "@/server/intelligence/adversary/assessment/assessment-service";

export interface AdversaryAssessmentPayload {
  assessmentId: string;
}

export const runAdversaryAssessment = task({
  id: "adversary-real-assessment",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: AdversaryAssessmentPayload) => {
    console.log(`[AdversaryReal] Iniciando evaluación real ${payload.assessmentId}`);
    await executeAssessment(payload.assessmentId);
    console.log(`[AdversaryReal] Evaluación ${payload.assessmentId} finalizada`);
    return { ok: true };
  },
});
