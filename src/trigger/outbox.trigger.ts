/**
 * outbox.trigger.ts — Drenador del outbox de eventos salientes (C6)
 *
 * Reclama filas `pending` con `FOR UPDATE SKIP LOCKED` (misma mecánica que
 * `scan_queue`) y despacha cada una. El productor dispara este task tras
 * commitear (wakeup de latencia); el propio registro en `outbox_events` es la
 * garantía durable: si el disparo se pierde, cualquier drenado posterior
 * (cualquier otro evento) reclama el backlog, porque el claim toma las filas
 * más antiguas primero.
 *
 * El despacho reutiliza `dispatch-webhook-task` (firma HMAC + guard SSRF en
 * `delivery.ts`), de modo que el outbox no duplica la lógica de entrega.
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { getOutbox, type OutboxRow } from "@/server/webhooks/outbox";
import { dispatchWebhookTask } from "./webhook.trigger";

/** Tipos de evento que el drenador sabe entregar como webhook. */
const WEBHOOK_EVENT_TYPES = new Set([
  "finding.created",
  "finding.critical",
  "anomaly.detected",
  "uptime.down",
  "webhook.test",
]);

async function dispatchRow(row: OutboxRow): Promise<void> {
  if (!WEBHOOK_EVENT_TYPES.has(row.event_type)) {
    logger.warn(`[outbox] tipo de evento sin handler — se marca done: ${row.event_type}`);
    return;
  }
  if (!row.project_id) {
    logger.warn(`[outbox] evento webhook sin project_id — se marca done: ${row.event_type}`);
    return;
  }
  await dispatchWebhookTask.trigger({
    projectId: row.project_id,
    event: row.event_type,
    data: (row.payload ?? {}) as Record<string, unknown>,
  });
}

export const drainOutboxTask = task({
  id: "drain-outbox-task",
  retry: { maxAttempts: 3 },
  run: async (payload: { max?: number; workerId?: string } = {}) => {
    const outbox = getOutbox();
    const workerId = payload.workerId ?? `drain-${Date.now()}`;
    const max = payload.max ?? 100;

    let processed = 0;
    let failed = 0;
    for (let i = 0; i < max; i++) {
      const row = await outbox.claim(workerId);
      if (!row) break;
      try {
        await dispatchRow(row);
        await outbox.complete(row.id);
        processed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await outbox.fail(row.id, message.slice(0, 500));
        failed++;
      }
    }

    logger.info(`[outbox] drenado: ${processed} entregados, ${failed} fallidos`);
    return { processed, failed };
  },
});
