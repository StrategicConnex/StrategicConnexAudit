/**
 * scenario-runner.ts — Adversary Scenario Runner Engine (P3.3)
 *
 * Orquesta la ejecución de escenarios de simulación de adversarios.
 * Cada escenario del catálogo se ejecuta de forma segura (no exploits
 * reales) y registra el resultado para tracking de cobertura MITRE.
 */

import { db } from "@/shared/db";
import { adversaryRuns } from "@/shared/db/schemas/adversary";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { eq } from "drizzle-orm";
import { ADVERSARY_CATALOG, type AdversaryScenarioDefinition } from "./catalog";

export type ScenarioResult = "detected" | "missed" | "error";

export interface RunScenarioInput {
  scenarioMitreId: string;
  projectId: string;
  investigationId?: string;
  detectedBy?: string;
  notes?: string;
}

export interface RunScenarioOutput {
  success: boolean;
  runId?: string;
  result?: ScenarioResult;
  scoreImpact?: number;
  output?: string;
  error?: string;
}

/**
 * Ejecuta un escenario de simulación de adversario.
 *
 * Fase 1 (MVP): Simulación informativa — registra el intento y crea
 * un hallazgo en intelligence_findings. El usuario reporta si fue
 * detectado o no por su stack de seguridad.
 *
 * Fase 2 (futuro): Ejecución remota via SSH/API contra el objetivo.
 */
export async function runScenario(input: RunScenarioInput): Promise<RunScenarioOutput> {
  const { scenarioMitreId, projectId, investigationId, detectedBy, notes } = input;

  // 1. Find scenario in catalog
  const scenarioDef = ADVERSARY_CATALOG.find((s) => s.mitreId === scenarioMitreId);
  if (!scenarioDef) {
    return {
      success: false,
      error: `Escenario no encontrado en el catálogo: ${scenarioMitreId}`,
    };
  }

  const startTime = new Date();

  try {
    // 2. Create a new run record
    const [run] = await db
      .insert(adversaryRuns)
      .values({
        projectId,
        status: "running",
        startedAt: startTime,
      })
      .returning();

    // 3. Generate simulated output
    const simulatedOutput = generateSimulatedOutput(scenarioDef, input);

    // 4. Create a finding in intelligence_findings (for dashboard visibility)
    if (investigationId) {
      await db.insert(intelligenceFindings).values({
        investigationId,
        projectId,
        severity: (scenarioDef.severity === "critical" || scenarioDef.severity === "high" || scenarioDef.severity === "medium" || scenarioDef.severity === "low")
          ? scenarioDef.severity : "medium",
        confidence: "0.800",
        title: `[SIM] ${scenarioDef.name}`,
        description: `Simulación de adversario: ${scenarioDef.description}`,
        recommendation: scenarioDef.detectionAdvice,
        evidence: {
          mitreId: scenarioDef.mitreId,
          mitreTactic: scenarioDef.mitreTactic,
          mitreTechnique: scenarioDef.mitreTechnique,
          executorCommand: scenarioDef.executorCommand,
          detectionAdvice: scenarioDef.detectionAdvice,
          prerequisites: scenarioDef.prerequisites,
          tags: scenarioDef.tags,
        },
        affectedAsset: "simulation",
      });
    }
    const severityMap: Record<string, "info" | "low" | "medium" | "high" | "critical"> = {
      info: "info",
      low: "low",
      medium: "medium",
      high: "high",
      critical: "critical",
    };


    // 5. Update run with result
    const result: ScenarioResult = "missed";
    const scoreImpact = scenarioDef.severity === "critical" ? -15
      : scenarioDef.severity === "high" ? -10
      : scenarioDef.severity === "medium" ? -5
      : -2;

    await db
      .update(adversaryRuns)
      .set({
        status: "completed",
        result,
        output: simulatedOutput,
        detectedBy: detectedBy || null,
        scoreImpact,
        completedAt: new Date(),
      })
      .where(eq(adversaryRuns.id, run.id));

    return {
      success: true,
      runId: run.id,
      result,
      scoreImpact,
      output: simulatedOutput,
    };
  } catch (err: any) {
    console.error(`[AdversaryRunner] Error ejecutando ${scenarioMitreId}:`, err.message);

    return {
      success: false,
      error: `Error ejecutando escenario: ${err.message}`,
    };
  }
}

/**
 * Genera output simulado para el escenario.
 * En Fase 1 (MVP), esto es texto informativo.
 */
function generateSimulatedOutput(
  scenario: AdversaryScenarioDefinition,
  input: RunScenarioInput
): string {
  const lines: string[] = [
    `╔══════════════════════════════════════════════════════════╗`,
    `║  SCAUDIT — Adversary Simulation Engine v1              ║`,
    `╠══════════════════════════════════════════════════════════╣`,
    `║  MITRE ID:       ${scenario.mitreId.padEnd(42)}║`,
    `║  Tactic:         ${scenario.mitreTactic.padEnd(42)}║`,
    `║  Technique:      ${scenario.mitreTechnique.padEnd(42)}║`,
    `║  Severity:       ${scenario.severity.padEnd(42)}║`,
    `╠══════════════════════════════════════════════════════════╣`,
    `║  Description:                                          ║`,
    `║  ${scenario.description.substring(0, 56).padEnd(56)}║`,
    `╠══════════════════════════════════════════════════════════╣`,
    `║  Detection Advice:                                      ║`,
    `║  ${scenario.detectionAdvice.substring(0, 56).padEnd(56)}║`,
    `╠══════════════════════════════════════════════════════════╣`,
    `║  Prerequisites:                                         ║`,
    ...scenario.prerequisites.map((p) =>
      `║  • ${p.substring(0, 55).padEnd(55)}║`
    ),
    `╠══════════════════════════════════════════════════════════╣`,
    `║  Note: This is a SAFE simulation. No actual exploits    ║`,
    `║  were executed. Report if your EDR/SIEM detected this   ║`,
    `║  activity pattern in your logs.                         ║`,
    `╚══════════════════════════════════════════════════════════╝`,
  ];

  return lines.join("\n");
}

/**
 * Reporta el resultado de una simulación (detectado o no detectado).
 * Usado por el usuario para cerrar el loop después de revisar sus logs.
 */
export async function reportScenarioResult(
  runId: string,
  result: ScenarioResult,
  detectedBy?: string
): Promise<boolean> {
  try {
    await db
      .update(adversaryRuns)
      .set({
        result,
        detectedBy: detectedBy || null,
        completedAt: new Date(),
      })
      .where(eq(adversaryRuns.id, runId));

    return true;
  } catch (err: any) {
    console.error(`[AdversaryRunner] Error reporting result for ${runId}:`, err.message);
    return false;
  }
}

/**
 * Lista los escenarios disponibles para un proyecto, incluyendo
 * el historial de ejecuciones previas.
 */
export async function listScenariosWithRuns(projectId: string) {
  const runs = await db
    .select()
    .from(adversaryRuns)
    .where(eq(adversaryRuns.projectId, projectId))
    .orderBy(adversaryRuns.createdAt);

  const catalogWithStatus = ADVERSARY_CATALOG.map((scenario) => {
    const scenarioRuns = runs.filter((r) => {
      // Match by mitreId (runs store scenarioId but we match from catalog)
      return true; // Simplified for MVP
    });

    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const totalRuns = runs.length;
    const detectedCount = runs.filter((r) => r.result === "detected").length;

    return {
      ...scenario,
      lastRun,
      totalRuns,
      detectedCount,
      detectionRate: totalRuns > 0 ? Math.round((detectedCount / totalRuns) * 100) : null,
    };
  });

  return catalogWithStatus;
}
