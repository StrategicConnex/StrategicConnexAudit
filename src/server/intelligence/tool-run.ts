/**
 * tool-run.ts — Ejecuta una herramienta del motor y persiste su resultado.
 *
 * Extraído de `POST /api/intelligence/runs` para que el camino **síncrono**
 * (route handler) y el **asíncrono** (worker de `scan_queue`, C3) compartan
 * EXACTAMENTE la misma lógica: ejecutar la tool, registrar `intelligence_tool_runs`,
 * insertar los findings y persistir el evento `finding.created` en el outbox
 * (C6) dentro de la misma transacción. Sin esta función el worker duplicaría el
 * registro y ambos caminos podrían divergir.
 */

import { withRLS } from "@/shared/db/rls";
import {
  intelligenceToolRuns,
  intelligenceFindings,
  outboxEvents,
} from "@/shared/db/schemas";
import { getToolDefinition } from "./core/tool-registry";
import { executeTool } from "./core/dispatcher";
import { wakeOutboxDrain } from "@/server/webhooks/outbox";
import { logger } from "@/lib/logger";

export interface ExecuteAndRecordToolRunInput {
  userId: string;
  projectId: string;
  investigationId?: string | null;
  toolId: string;
  target: string;
  input: Record<string, unknown>;
}

export interface ExecuteAndRecordToolRunResult {
  success: boolean;
  run: typeof intelligenceToolRuns.$inferSelect;
}

/**
 * Ejecuta la herramienta y persiste el run + findings + evento de outbox.
 *
 * Lanza si la herramienta no está registrada (el llamante decide si responde
 * 404 o si marca el job de la cola como `failed`). Los fallos de ejecución de
 * la tool NO lanzan: se devuelven como `success: false` con el run en `failed`.
 */
export async function executeAndRecordToolRun(
  input: ExecuteAndRecordToolRunInput
): Promise<ExecuteAndRecordToolRunResult> {
  const { userId, projectId, investigationId, toolId, target, input: toolInput } = input;

  const toolDef = getToolDefinition(toolId);
  if (!toolDef) {
    throw new Error(`Herramienta diagnóstica '${toolId}' no está registrada.`);
  }

  const startedAt = new Date();
  const tStart = Date.now();

  const executionResult = await executeTool(
    toolId,
    target,
    toolInput,
    projectId,
    investigationId ?? undefined,
    userId
  );

  const durationMs = Date.now() - tStart;
  const status = executionResult.success ? "completed" : "failed";
  const findings = executionResult.findings ?? [];

  const record = await withRLS(userId, async (tx) => {
    // 1. Insertar la ejecución de la herramienta
    const [insertedRun] = await tx
      .insert(intelligenceToolRuns)
      .values({
        projectId,
        investigationId: investigationId || null,
        toolId,
        category: toolDef.category,
        status,
        input: toolInput,
        output: executionResult.output,
        error: executionResult.error || null,
        durationMs,
        startedAt,
        completedAt: new Date(),
      })
      .returning();
    if (!insertedRun) throw new Error("Fallo al registrar la ejecución de la herramienta");

    // 2. Si hubo findings reales, insertarlos de forma atómica
    if (findings.length > 0 && investigationId) {
      const findingsToInsert = findings.map((finding) => ({
        projectId,
        investigationId,
        toolRunId: insertedRun.id,
        severity: finding.severity as "info" | "low" | "medium" | "high" | "critical",
        confidence: String(Number(finding.confidence) || 0.7),
        title: finding.title,
        description: finding.description,
        recommendation: finding.remediation || finding.recommendation || null,
        evidence: (finding.evidence ?? {}) as Record<string, unknown>,
        affectedAsset: finding.affectedAsset ?? null,
      }));
      await tx.insert(intelligenceFindings).values(findingsToInsert);

      // C6: evento `finding.created` persistido en el outbox DENTRO de la
      // misma transacción que el cambio de dominio — si el commit revierte,
      // el evento no existe; si commitea, está garantizado. El drenador lo
      // entrega reutilizando `dispatch-webhook-task`.
      const severities: Record<string, number> = {};
      for (const f of findingsToInsert) {
        severities[f.severity] = (severities[f.severity] ?? 0) + 1;
      }
      await tx.insert(outboxEvents).values({
        eventType: "finding.created",
        aggregateType: "project",
        aggregateId: projectId,
        projectId,
        payload: { count: findingsToInsert.length, severities },
      });
    }

    return insertedRun;
  });

  // Wakeup del drenador (latencia). El outbox es durable: si este disparo se
  // pierde, cualquier drenado posterior reclama el backlog. Nunca lanza.
  if (investigationId && findings.length > 0) {
    void wakeOutboxDrain().catch((error: unknown) => {
      logger.warn("[tool-run] no se pudo despertar al drenador del outbox:", error);
    });
  }

  return { success: executionResult.success, run: record };
}
