/**
 * scan-queue-worker.ts — Drenador de la cola de escaneo (C3)
 *
 * Misma mecánica que el drenador del outbox (C6): reclama jobs con
 * `FOR UPDATE SKIP LOCKED` (+ reserva atómica de slot por plan) y los ejecuta
 * con el motor real. La lógica vive aquí, separada del task de Trigger.dev,
 * para poder testearla sin el SDK.
 *
 * Política de reintentos: sólo se reintenta (con backoff exponencial, que ya
 * implementa `ScanQueue.fail`) cuando la ejecución **lanza** — es decir, fallos
 * de infraestructura. Un resultado `success: false` de la tool es un desenlace
 * legítimo del escaneo: el run queda persistido como `failed` y el job se marca
 * `done`, para no duplicar findings ni volver a gastar cuota del plan.
 */

import { logger } from "@/lib/logger";
import { PLAN_CONCURRENCY, type ScanJobRow, type ScanQueue } from "./scan-queue";
import { executeAndRecordToolRun } from "./tool-run";

/** Subconjunto de la cola que necesita el drenador (inyectable en tests). */
export type ScanQueueClaimer = Pick<ScanQueue, "claim" | "complete" | "fail">;

export interface DrainScanQueueDeps {
  queue: ScanQueueClaimer;
  /** Ejecutor del job; por defecto `runScanJob` (motor real). */
  runJob?: (job: ScanJobRow) => Promise<void>;
  /** Cupo de concurrencia por plan que se pasa a `claim`. */
  limits?: Record<string, number>;
}

export interface DrainScanQueueOptions {
  max?: number;
  workerId?: string;
}

export interface DrainScanQueueResult {
  processed: number;
  failed: number;
}

/**
 * Ejecuta un job de la cola: corre la herramienta y persiste el run, los
 * findings y el evento de outbox con la MISMA lógica que el camino síncrono.
 *
 * Lanza si el job no tiene `user_id` (no se puede ejecutar bajo RLS) o si la
 * herramienta no existe; el drenador lo marca `failed` y reintenta con backoff.
 */
export async function runScanJob(job: ScanJobRow): Promise<void> {
  if (!job.user_id) {
    throw new Error("Job sin user_id: no se puede ejecutar bajo RLS");
  }

  const input = (job.input ?? {}) as Record<string, unknown>;
  const target = typeof input.target === "string" && input.target ? input.target : job.target;
  const investigationId =
    typeof input.investigationId === "string" ? input.investigationId : null;

  const result = await executeAndRecordToolRun({
    userId: job.user_id,
    projectId: job.project_id,
    investigationId,
    toolId: job.tool_id,
    target,
    input,
  });

  if (!result.success) {
    logger.warn(
      `[scan-queue] job ${job.id} ejecutado con fallo de tool (run ${result.run.id}); no se reintenta`
    );
  }
}

/**
 * Drena hasta `max` jobs. Reclama con el cupo por plan, ejecuta y libera el
 * slot (`complete`/`fail`). Devuelve cuántos se ejecutaron y cuántos fallaron.
 */
export async function drainScanQueue(
  { queue, runJob = runScanJob, limits = PLAN_CONCURRENCY }: DrainScanQueueDeps,
  options: DrainScanQueueOptions = {}
): Promise<DrainScanQueueResult> {
  const workerId = options.workerId ?? `scan-${Date.now()}`;
  const max = options.max ?? 50;

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < max; i++) {
    const job = await queue.claim({ workerId, limits });
    if (!job) break;

    try {
      await runJob(job);
      await queue.complete(job.id);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await queue.fail(job.id, message.slice(0, 500));
      failed++;
    }
  }

  logger.info(`[scan-queue] drenado: ${processed} ejecutados, ${failed} fallidos`);
  return { processed, failed };
}
