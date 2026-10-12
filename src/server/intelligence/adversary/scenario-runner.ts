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
import { logger } from "@/lib/logger";

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
  /** true ⇒ el escenario NO se ejecutó: no se persistió run, output ni findings. */
  skipped?: boolean;
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

    // 2. Resolve the target (project domain) to substitute $TARGET in the
    //    executor command, y ejecutar el comando dentro del sandbox.
    const [project] = await db
      .select({ domain: projects.domain })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    let sandboxResult: SandboxExecutionResult | null = null;
    // Gate de seguridad operativa: ADVERSARY_SANDBOX_ENABLED=false desactiva
    // la ejecución real. Default: habilitado.
    const sandboxEnabled = process.env.ADVERSARY_SANDBOX_ENABLED !== "false";
    if (sandboxEnabled && project?.domain && scenarioDef.executorType !== "manual") {
      sandboxResult = await runSandboxedCommand({
        executorType: scenarioDef.executorType,
        executorCommand: scenarioDef.executorCommand,
        target: project.domain,
        timeoutMs: 15_000,
      });
    }

    const executed = sandboxResult?.executed === true;
    const isManual = scenarioDef.executorType === "manual";

    // 3. Task 11 (2026-10-11) — CORTE DE LA SIMULACIÓN.
    //    Si el escenario no se ejecutó de verdad (sandbox deshabilitado, comando
    //    fuera de la allowlist, bloqueado por egress-guard, target sin dominio o
    //    powershell sin host Windows), NO se registra nada: ni run, ni output, ni
    //    finding. Antes se persistía un transcript decorativo y un hallazgo de
    //    simulación (con `evidence.sandbox: null`) para cualquier escenario, y la
    //    run quedaba cerrada como "missed": una no-detección indistinguible de
    //    una real.
    if (!executed && !isManual) {
      const detail =
        sandboxResult?.detail ??
        sandboxResult?.status ??
        "sandbox deshabilitado o proyecto sin dominio";
      return {
        success: false,
        skipped: true,
        error:
          `SANDBOX_UNAVAILABLE: el escenario ${scenarioDef.mitreId} no se ejecutó (${detail}). ` +
          "No se registra run, output ni hallazgo.",
      };
    }

    // 4. Crear la run: sólo hay run si hubo ejecución real, o si el escenario es
    //    manual (lo ejecuta el operador y reporta el resultado con PATCH).
    const [run] = await db
      .insert(adversaryRuns)
      .values({
        scenarioId,
        projectId,
        status: "running",
        startedAt: startTime,
      })
      .returning();
    if (!run) throw new Error("Fallo al crear el registro de ejecución del escenario");

    // 5. Output: transcript REAL del sandbox o —sólo en escenarios manuales— la
    //    referencia del comando que debe ejecutar el operador. Nunca un
    //    transcript de "simulación" que afirme algo que no se observó.
    const output = executed
      ? sandboxResult!.output
      : [
          `[MANUAL] ${scenarioDef.mitreId} — la ejecución la realiza el operador contra ${project?.domain ?? "el objetivo"}.`,
          "Comando de referencia:",
          `  ${scenarioDef.executorCommand}`,
          "",
          "Cuando lo hayas ejecutado, reporta el resultado real con PATCH (detected | missed).",
        ].join("\n");

    // 6. Findings: sólo de evidencia real. El hallazgo base describe una técnica
    //    que SÍ se ejecutó; los `[ADV-SANDBOX]` salen del parseo del output real.
    //    Un escenario manual no genera findings propios: no hay nada observado.
    if (investigationId && executed) {
      await db.insert(intelligenceFindings).values({
        investigationId,
        projectId,
        severity: (scenarioDef.severity === "critical" || scenarioDef.severity === "high" || scenarioDef.severity === "medium" || scenarioDef.severity === "low")
          ? scenarioDef.severity : "medium",
        confidence: "0.800",
        title: `[ADV] ${scenarioDef.name}`,
        description: `Técnica de adversario ejecutada en sandbox: ${scenarioDef.description}`,
        recommendation: scenarioDef.detectionAdvice,
        evidence: {
          mitreId: scenarioDef.mitreId,
          mitreTactic: scenarioDef.mitreTactic,
          mitreTechnique: scenarioDef.mitreTechnique,
          executorCommand: scenarioDef.executorCommand,
          detectionAdvice: scenarioDef.detectionAdvice,
          prerequisites: scenarioDef.prerequisites,
          tags: scenarioDef.tags,
          sandbox: {
            executed: true,
            status: sandboxResult!.status,
            durationMs: sandboxResult!.durationMs,
            findingsCount: sandboxResult!.findings.length,
          },
        },
        affectedAsset: project?.domain ?? "simulation",
      });

      // Hallazgos parseados del output real (puertos abiertos, endpoints
      // expuestos, etc.) — solo cuando el sandbox produjo evidencia real.
      if (sandboxResult!.findings.length > 0) {
        for (const finding of sandboxResult!.findings.slice(0, 5)) {
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
              sandboxStatus: sandboxResult!.status,
              sandboxDurationMs: sandboxResult!.durationMs,
            },
            affectedAsset: project?.domain ?? "simulation",
          });
        }
      }
    }

    // 7. Cerrar la run.
    //    NOTA: `result` sigue arrancando en "missed" — es el valor por defecto
    //    del producto ("no reportado") que el operador corrige con PATCH a
    //    "detected". Lo que esta tarea elimina es el output y los findings
    //    INVENTADOS para escenarios que nunca se ejecutaron.
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
    logger.error(`[AdversaryRunner] Error ejecutando ${scenarioMitreId}:`, err);

    return {
      success: false,
      error: `Error ejecutando escenario: ${msg}`,
    };
  }
}

/* NOTA (Task 11, 2026-10-11): aquí vivía el generador de transcript simulado,
   que fabricaba un texto decorativo (una cabecera de "engine" de simulación y la
   nota de que no se ejecutó ningún exploit) para cualquier escenario que no se
   hubiera ejecutado. Ese texto se persistía como `adversary_runs.output` y se
   mostraba en el dashboard como si fuera el resultado de una prueba. Un escenario
   sin ejecución real no tiene transcript. */

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
