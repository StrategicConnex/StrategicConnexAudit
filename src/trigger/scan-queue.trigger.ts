/**
 * scan-queue.trigger.ts — Drenadores de la cola de escaneo (C3)
 *
 * Reclaman jobs `queued` con `FOR UPDATE SKIP LOCKED` (misma mecánica que el
 * outbox, C6) respetando el cupo de concurrencia por plan, y los ejecutan con el
 * motor real:
 *
 *   * `drainScanQueueTask` — disparado por el productor (`enqueueScanJob`) tras
 *     encolar, como wakeup de latencia.
 *   * `drainScanQueueSchedule` — red de seguridad cada 5 minutos: si un wakeup se
 *     pierde, la cola no queda estancada. Es idempotente y barato con la cola
 *     vacía (el `claim` con `SKIP LOCKED` no encuentra filas y el ciclo termina
 *     sin escrituras ni logs de trabajo).
 *   * `purgeScanQueueTask` — retención: borra los jobs terminados (`done`/`failed`)
 *     más viejos que `SCAN_QUEUE_RETENTION_DAYS` para que la tabla no crezca sin
 *     límite. No tiene cron propio (el plan gratuito de Trigger.dev sólo admite
 *     10 schedules y el repo ya usa los 10): lo encola el **dispatcher diario**
 *     (`daily-operations-dispatcher`, `0 3 * * *`), igual que el resto de jobs de
 *     cadencia lenta. Es idempotente: sin nada que purgar devuelve 0 y no
 *     escribe ni loguea.
 *
 * El registro en `scan_queue` es la garantía durable: el claim toma los jobs de
 * mayor prioridad y más antiguos, así que cualquier drenado posterior reclama el
 * backlog pendiente.
 *
 * La lógica vive en `src/server/intelligence/scan-queue-worker.ts` para poder
 * testearla sin el SDK.
 */

import { logger, schedules, task } from "@trigger.dev/sdk/v3";
import type { CronJobPayload } from "./cron-plan";
import {
  getScanQueue,
  PLAN_CONCURRENCY,
  purgeCompletedScanJobs,
  SCAN_QUEUE_RETENTION_DAYS,
} from "@/server/intelligence/scan-queue";
import { drainScanQueue } from "@/server/intelligence/scan-queue-worker";

/** Cuántos jobs reclama como máximo cada ciclo de drenado. */
const DRAIN_MAX = 100;

async function runDrain(source: string, options: { max: number; workerId?: string }) {
  const result = await drainScanQueue(
    { queue: getScanQueue(), limits: PLAN_CONCURRENCY },
    options
  );

  // Silencio cuando la cola está vacía: con SKIP LOCKED no hay trabajo que
  // reportar y un log cada 5 minutos solo generaría ruido.
  if (result.processed > 0 || result.failed > 0) {
    logger.info(
      `[scan-queue] drenado (${source}): ${result.processed} ejecutados, ${result.failed} fallidos`
    );
  }

  return result;
}

export const drainScanQueueTask = task({
  id: "drain-scan-queue-task",
  retry: { maxAttempts: 3 },
  run: async (payload: { max?: number; workerId?: string } = {}) =>
    runDrain("wakeup", { max: payload.max ?? DRAIN_MAX, workerId: payload.workerId }),
});

/**
 * Purga de la cola: borra los jobs terminados que superan la retención.
 *
 * No es un `schedules.task` (no queda hueco en el presupuesto de 10 schedules
 * del plan gratuito): lo encola el dispatcher diario de operaciones.
 * La ejecución delega en `purgeCompletedScanJobs`, que propaga los errores de BD a
 * propósito para que el `retry` de Trigger.dev reintente la purga en vez de
 * perderla en silencio.
 */
export const purgeScanQueueTask = task({
  id: "purge-scan-queue-task",
  retry: { maxAttempts: 3 },
  // El payload es el contrato del dispatcher (`CronJobPayload`); `retentionDays`
  // es un override opcional para disparos manuales, no parte del cron.
  run: async (payload: CronJobPayload & { retentionDays?: number }) => {
    const retentionDays = payload.retentionDays ?? SCAN_QUEUE_RETENTION_DAYS;
    const purged = await purgeCompletedScanJobs(retentionDays);

    // Silencio cuando no hay nada que purgar: 0 filas no es un incidente.
    if (purged > 0) {
      logger.info(
        `[scan-queue] purga (retención ${retentionDays} d): ${purged} jobs terminados borrados`
      );
    }

    return { purged, retentionDays };
  },
});

export const drainScanQueueSchedule = schedules.task({
  id: "drain-scan-queue",
  cron: "*/5 * * * *", // Cada 5 minutos (red de seguridad de wakeups perdidos)
  retry: { maxAttempts: 3 },
  run: async () => runDrain("schedule", { max: DRAIN_MAX }),
});
