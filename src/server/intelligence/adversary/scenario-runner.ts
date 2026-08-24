/**
 * scenario-runner.ts — Adversary Scenario Runner Engine (P3.3)
 *
 * Orquesta la ejecución de escenarios de simulación de adversarios.
 * Cada escenario del catálogo se ejecuta de forma segura (no exploits
 * reales) y registra el resultado para tracking de cobertura MITRE.
 */

import { db } from "@/shared/db";
import { adversaryRuns, adversaryScenarios } from "@/shared/db/schemas/adversary";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { projects } from "@/shared/db/schemas";
import { eq, desc } from "drizzle-orm";
import { ADVERSARY_CATALOG, type AdversaryScenarioDefinition } from "./catalog";
import { runSandboxedCommand, type SandboxExecutionResult } from "./sandbox-executor";
import { getErrorMessage } from "@/shared/lib/errors";

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
 * Devuelve el id de la fila en adversary_scenarios para un escenario del
 * catálogo, creándola si no existe (el catálogo vive en código, la tabla
 * persiste el template para poder atribuir runs por scenario_id).
 *
 * Fix P0: antes runScenario insertaba runs sin scenario_id (NULL), por lo
 * que las estadísticas por escenario se atribuían a todos (bug del filtro
 * `return true` en listScenariosWithRuns / GET).
 *
 * Fix race condition: el select-then-insert original permitía filas
 * duplicadas cuando dos POSTs concurrentes (o POST+cron) colisionaban.
 * Con el índice ÚNICO uniq_adversary_mitre_id (migración 0018) + insert
 * con onConflictDoNothing({ target: mitreId }), la segunda escritura
 * concurrente es un no-op y se re-lee el id canónico — la unicidad queda
 * garantizada a nivel de base de datos.
 */
export async function getOrCreateScenarioId(
  scenario: AdversaryScenarioDefinition
): Promise<string> {
  // 1. Fast path: leer el id existente.
  const existing = await db
    .select({ id: adversaryScenarios.id })
    .from(adversaryScenarios)
    .where(eq(adversaryScenarios.mitreId, scenario.mitreId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  // 2. Insert con ON CONFLICT DO NOTHING: si otra escritura concurrente
  //    ganó la carrera (índice único 0018), este insert es un no-op.
  await db
    .insert(adversaryScenarios)
    .values({
      mitreId: scenario.mitreId,
      mitreTactic: scenario.mitreTactic,
      mitreTechnique: scenario.mitreTechnique,
      name: scenario.name,
      description: scenario.description,
      detectionAdvice: scenario.detectionAdvice,
      executorType: scenario.executorType,
      executorCommand: scenario.executorCommand,
      severity: scenario.severity,
      prerequisites: scenario.prerequisites,
      tags: scenario.tags,
    })
    .onConflictDoNothing({ target: adversaryScenarios.mitreId });

  // 3. Re-leer: el id existe garantizado (insertado por nosotros o por la
  //    escritura concurrente ganadora). Devuelve siempre el canónico.
  const [row] = await db
    .select({ id: adversaryScenarios.id })
    .from(adversaryScenarios)
    .where(eq(adversaryScenarios.mitreId, scenario.mitreId))
    .limit(1);

  if (!row) {
    throw new Error(
      `getOrCreateScenarioId: no se pudo resolver/crear el escenario ${scenario.mitreId}`
    );
  }
  return row.id;
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
  const { scenarioMitreId, projectId, investigationId, detectedBy } = input;

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
    // 1.5 Resolve (or create) the scenario template row so the run can be
    //     attributed to its scenario (fix P0: scenario_id ya no queda NULL).
    const scenarioId = await getOrCreateScenarioId(scenarioDef);

    // 2. Create a new run record
    const [run] = await db
      .insert(adversaryRuns)
      .values({
        scenarioId,
        projectId,
        status: "running",
        startedAt: startTime,
      })
      .returning();

    // 2.5 Resolve the target (project domain) to substitute $TARGET in the
    //     executor command, and run the command inside the sandbox.
    const [project] = await db
      .select({ domain: projects.domain })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    let sandboxResult: SandboxExecutionResult | null = null;
    // Gate de seguridad operativa: ADVERSARY_SANDBOX_ENABLED=false desactiva
    // la ejecución real (fallback al output simulado). Default: habilitado.
    const sandboxEnabled = process.env.ADVERSARY_SANDBOX_ENABLED !== "false";
    if (sandboxEnabled && project?.domain && scenarioDef.executorType !== "manual") {
      sandboxResult = await runSandboxedCommand({
        executorType: scenarioDef.executorType,
        executorCommand: scenarioDef.executorCommand,
        target: project.domain,
        timeoutMs: 15_000,
      });
    }

    // 3. Output: usa el transcript real del sandbox cuando hubo ejecución
    //    real; de lo contrario cae al output simulado informativo. Cuando el
    //    sandbox devuelve unsupported (powershell/manual), surfacea el
    //    advisory en vez de descartarlo silenciosamente.
    const simulatedOutput = generateSimulatedOutput(scenarioDef);
    const output =
      sandboxResult && sandboxResult.executed
        ? sandboxResult.output
        : sandboxResult && sandboxResult.status === "unsupported"
          ? `${sandboxResult.output}\n\n${simulatedOutput}`
          : simulatedOutput;

    // 4. Findings: el hallazgo base [SIM] (visibilidad en dashboard) + los
    //    hallazgos parseados del output real del sandbox.
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
          sandbox: sandboxResult
            ? {
                executed: sandboxResult.executed,
                status: sandboxResult.status,
                durationMs: sandboxResult.durationMs,
                findingsCount: sandboxResult.findings.length,
              }
            : null,
        },
        affectedAsset: project?.domain ?? "simulation",
      });

      // Hallazgos parseados del output real (puertos abiertos, endpoints
      // expuestos, etc.) — solo cuando el sandbox produjo evidencia real.
      if (sandboxResult && sandboxResult.findings.length > 0) {
        for (const finding of sandboxResult.findings.slice(0, 5)) {
          await db.insert(intelligenceFindings).values({
            investigationId,
            projectId,
            severity: finding.severity,
            confidence: "0.700",
            title: `[ADV-SANDBOX] ${finding.title}`,
            description: finding.description,
            evidence: {
              ...finding.evidence,
              mitreId: scenarioDef.mitreId,
              sandboxStatus: sandboxResult.status,
              sandboxDurationMs: sandboxResult.durationMs,
            },
            affectedAsset: project?.domain ?? "simulation",
          });
        }
      }
    }

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
        output,
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
      output,
    };
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    console.error(`[AdversaryRunner] Error ejecutando ${scenarioMitreId}:`, err);

    return {
      success: false,
      error: `Error ejecutando escenario: ${msg}`,
    };
  }
}

/**
 * Genera output simulado para el escenario.
 * En Fase 1 (MVP), esto es texto informativo.
 */
function generateSimulatedOutput(
  scenario: AdversaryScenarioDefinition
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
 * Lista los escenarios disponibles para un proyecto, incluyendo
 * el historial de ejecuciones previas, atribuyendo cada run a su
 * escenario vía scenario_id (fix P0: antes el filtro era `return true`
 * y TODOS los runs se contaban para TODOS los escenarios).
 *
 * Devuelve { catalog, runs } para que el GET no duplique la consulta.
 */
export async function listScenariosWithRuns(projectId: string) {
  const [runs, scenarioRows] = await Promise.all([
    db
      .select()
      .from(adversaryRuns)
      .where(eq(adversaryRuns.projectId, projectId))
      .orderBy(desc(adversaryRuns.createdAt))
      // Ventana acotada: el cron inserta runs cada 6h; stats sobre las
      // últimas 1000 ejecuciones siguen siendo representativas sin
      // payloads sin límite en la respuesta del GET.
      .limit(1000),
    db.select().from(adversaryScenarios),
  ]);

  // Map mitreId → DB id (scenario_id) para atribuir runs correctamente.
  const scenarioIdByMitre = new Map(
    scenarioRows.map((s) => [s.mitreId, s.id])
  );

  const catalogWithStatus = ADVERSARY_CATALOG.map((scenario) => {
    const scenarioDbId = scenarioIdByMitre.get(scenario.mitreId);
    const scenarioRuns = scenarioDbId
      ? runs.filter((r) => r.scenarioId === scenarioDbId)
      : [];

    const lastRun = scenarioRuns.length > 0 ? scenarioRuns[0] : null;
    const totalRuns = scenarioRuns.length;
    const detectedCount = scenarioRuns.filter((r) => r.result === "detected").length;

    return {
      ...scenario,
      lastRun,
      totalRuns,
      detectedCount,
      detectionRate: totalRuns > 0 ? Math.round((detectedCount / totalRuns) * 100) : null,
    };
  });

  return { catalog: catalogWithStatus, runs };
}
