/**
 * mitre-service.ts — Ciclo de vida de la Evaluación Real de Cobertura MITRE.
 *
 * pending → running (checks reales) → analyzing (agente AI) → completed
 */

import { directDb } from "@/shared/db";
import { mitreEvaluations, mitreTechniqueResults } from "@/shared/db/schemas/adversary";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { mapLimit } from "@/shared/lib/map-limit";
import { runMitreEvaluation, type MitreVerdict } from "./mitre-runner";
import {
  analyzeTestableTechnique,
  generatePlaybook,
  synthesizeCoverageSummary,
} from "./mitre-analyst";

export async function executeMitreEvaluation(evaluationId: string): Promise<void> {
  const [evaluation] = await directDb
    .select({
      id: mitreEvaluations.id,
      target: mitreEvaluations.target,
      projectId: mitreEvaluations.projectId,
    })
    .from(mitreEvaluations)
    .where(eq(mitreEvaluations.id, evaluationId))
    .limit(1);

  if (!evaluation) throw new Error(`MitreEvaluation ${evaluationId} no encontrada`);

  try {
    await directDb
      .update(mitreEvaluations)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(mitreEvaluations.id, evaluationId));

    // ── 1. Fase de ejecución real ──
    const run = await runMitreEvaluation(evaluation.target, ({ done, total, currentStep }) => {
      directDb
        .update(mitreEvaluations)
        .set({ checksDone: done, checksTotal: total, currentStep, updatedAt: new Date() })
        .where(eq(mitreEvaluations.id, evaluationId))
        .catch(() => { /* progreso no bloqueante */ });
    });
    if (!run.success || !run.evidence) {
      throw new Error(run.error ?? "El motor MITRE no devolvió evidencia");
    }

    await directDb
      .update(mitreEvaluations)
      .set({ status: "analyzing", currentStep: "análisis AI", rawEvidence: run.evidence as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(mitreEvaluations.id, evaluationId));

    // ── 2. Fase AI por técnica ──

    // P2-3: stack hoisted (era O(n^2): se recalculaba por tecnica)
    // + veredictos en concurrencia acotada (2) en vez de secuencial puro.
    const detectedStack = (
      run.evidence.techniques
        .flatMap((t) => t.checkResults)
        .find((c) => c.id === "tech-fingerprint" && c.status !== "error")
        ?.evidence as { detected?: Array<{ product: string; version?: string }> } | undefined
    )?.detected ?? [];
    const detectedStackLocal = detectedStack.map(
      (d) => `${d.product}${d.version ? ` ${d.version}` : ""}`
    );

    type Technique = (typeof run.evidence.techniques)[number];
    interface TechniqueOutcome {
      digest: { mitreId: string; techniqueName: string; verdict: MitreVerdict };
      exposed: number;
      protected: number;
      manual: number;
      modelUsed: string | null;
    }
    const tally = (verdict: MitreVerdict): Omit<TechniqueOutcome, "digest" | "modelUsed"> => ({
      exposed: verdict === "exposed" ? 1 : 0,
      protected: verdict === "not_exposed" ? 1 : 0,
      manual: verdict !== "exposed" && verdict !== "not_exposed" && verdict !== "error" ? 1 : 0,
    });

    const outcomes = await mapLimit(run.evidence.techniques, 2, async (technique: Technique): Promise<TechniqueOutcome> => {
      const digest = {
        mitreId: technique.mitreId,
        techniqueName: technique.techniqueName,
        verdict: "error" as MitreVerdict,
      };
      if (technique.notExternallyTestable) {
        let playbookResult;
        try {
          playbookResult = await generatePlaybook(
            technique.mitreId,
            technique.techniqueName,
            detectedStackLocal,
            evaluation.target
          );
        } catch {
          playbookResult = {
            verdict: "not_externally_testable" as const,
            summary: `Técnica ${technique.mitreId} requiere validación interna; el generador de playbooks no estaba disponible.`,
            playbook: [
              "Validar detección de esta técnica con el equipo interno usando la guía MITRE ATT&CK oficial (attack.mitre.org/techniques/" + technique.mitreId + "/).",
            ],
            modelUsed: null,
          };
        }
        await directDb.insert(mitreTechniqueResults).values({
          evaluationId,
          mitreId: technique.mitreId,
          tactic: technique.tactic,
          techniqueName: technique.techniqueName,
          verdict: "not_externally_testable",
          confidence: "0.90",
          summary: playbookResult.summary,
          playbook: playbookResult.playbook,
          aiModel: playbookResult.modelUsed,
        });
        digest.verdict = "not_externally_testable";
        return { digest, ...tally(digest.verdict), modelUsed: playbookResult.modelUsed };
      }

      // Técnica testable → veredicto AI sobre evidencia real
      let ai: Awaited<ReturnType<typeof analyzeTestableTechnique>> | {
        verdict: "error";
        confidence: number;
        summary: string;
        remediation: string[];
        modelUsed: string | null;
      };
      try {
        ai = await analyzeTestableTechnique(technique, evaluation.target);
      } catch {
        ai = {
          verdict: "error",
          confidence: 0,
          summary: `Análisis AI no disponible para ${technique.mitreId}. Evidencia cruda conservada.`,
          remediation: [],
          modelUsed: null,
        };
      }

      digest.verdict = ai.verdict;

      await directDb.insert(mitreTechniqueResults).values({
        evaluationId,
        mitreId: technique.mitreId,
        tactic: technique.tactic,
        techniqueName: technique.techniqueName,
        verdict: ai.verdict,
        confidence: String(ai.confidence),
        evidence: {
          checks: technique.checkResults.map((c) => ({ id: c.id, status: c.status, severity: c.severity ?? null, summary: c.summary })),
          portProbes: technique.portProbes ?? null,
        },
        summary: ai.summary,
        remediation: ai.remediation,
        aiModel: ai.modelUsed,
      });
      return { digest, ...tally(digest.verdict), modelUsed: ai.modelUsed };
    });

    let modelUsed: string | null = null;
    let exposed = 0;
    let protectedCount = 0;
    let manualOnly = 0;
    const verdictDigest: Array<{ mitreId: string; techniqueName: string; verdict: MitreVerdict }> = [];
    for (const o of outcomes) {
      verdictDigest.push(o.digest);
      exposed += o.exposed;
      protectedCount += o.protected;
      manualOnly += o.manual;
      modelUsed ??= o.modelUsed;
    }

    // ── 3. Síntesis ejecutiva ──
    let riskScore: number | null = null;
    let summary: string | null = null;
    try {
      const exec = await synthesizeCoverageSummary(verdictDigest, evaluation.target);
      riskScore = exec.riskScore;
      summary = exec.summary;
    } catch {
      summary = `${exposed} técnica(s) explotable(s), ${protectedCount} protegida(s), ${manualOnly} solo-validables internamente.`;
    }

    await directDb
      .update(mitreEvaluations)
      .set({
        status: "completed",
        exposedCount: exposed,
        protectedCount: protectedCount,
        manualOnlyCount: manualOnly,
        riskScore,
        summary,
        modelUsed,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mitreEvaluations.id, evaluationId));
  } catch (err) {
    // Sanitizado: nunca persistas el dump SQL de Drizzle crudo (se renderiza en la UI)
    const raw = err instanceof Error ? err.message : String(err);
    const cause = (err as { cause?: { message?: string; detail?: string } })?.cause;
    const short = raw.startsWith("Failed query")
      ? "Fallo de base de datos al persistir la evaluación MITRE"
      : raw.slice(0, 300);
    const errorText = cause?.message
      ? `${short} | causa: ${cause.message.slice(0, 200)}${cause.detail ? ` (${cause.detail.slice(0, 120)})` : ""}`
      : short;
    await directDb
      .update(mitreEvaluations)
      .set({
        status: "failed",
        error: errorText,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mitreEvaluations.id, evaluationId));
  }
}
