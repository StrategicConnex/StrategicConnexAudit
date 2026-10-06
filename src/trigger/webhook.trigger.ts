import { logger, task } from "@trigger.dev/sdk/v3";
import { db } from "@/shared/db";
import { webhookConfigs } from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import { runWithCorrelation } from "@/lib/request-context";
import { defaultDeliveryDeps, deliverWebhooks } from "@/server/webhooks/delivery";

export interface WebhookPayload {
  projectId: string;
  event: string;
  data: Record<string, unknown>;
  /** G2 — id de correlación de la request/productor que encoló el evento. */
  correlationId?: string;
}

/**
 * Task asíncrona de despacho de webhooks salientes (con reintentos).
 *
 * La lógica de firma, cabeceras y validación SSRF vive en
 * `src/server/webhooks/delivery.ts` para que el endpoint de prueba
 * (POST /api/webhooks/[id]/test) ejercite EXACTAMENTE el mismo camino.
 * Aquí solo queda lo propio de Trigger.dev: consultar destinos, entregar y
 * lanzar para que la plataforma reintente.
 */
export const dispatchWebhookTask = task({
  id: "dispatch-webhook-task",
  retry: { maxAttempts: 5 }, // Trigger.dev maneja backoff exponencial automáticamente
  run: async (payload: WebhookPayload, { ctx }) =>
    runWithCorrelation(payload.correlationId, () => dispatchWebhookJob(payload, { ctx })),
});

async function dispatchWebhookJob(
  payload: WebhookPayload,
  { ctx }: { ctx: { run: { id: string } } }
) {
  logger.info(`Iniciando envío de webhook event '${payload.event}' para proyecto ${payload.projectId}`);

  // Configuraciones activas del proyecto; el filtro por evento suscrito lo
  // aplica `deliverWebhooks` (misma regla que usa el endpoint de prueba).
  const configs = await db.query.webhookConfigs.findMany({
    where: and(eq(webhookConfigs.projectId, payload.projectId), eq(webhookConfigs.active, true)),
  });

  if (configs.length === 0) {
    logger.info("No hay webhooks activos configurados para este proyecto.");
    return { delivered: 0, failed: 0 };
  }

  const deps = defaultDeliveryDeps({
    logger: {
      info: (msg: string, meta?: unknown) => logger.info(msg, meta as Record<string, unknown> | undefined),
      error: (msg: string, meta?: unknown) => logger.error(msg, meta as Record<string, unknown> | undefined),
    },
  });

  const summary = await deliverWebhooks(
    configs.map((c) => ({
      id: c.id,
      url: c.url,
      secretToken: c.secretToken,
      events: Array.isArray(c.events) ? c.events : null,
    })),
    { id: ctx.run.id, event: payload.event, data: payload.data },
    deps,
  );

  // Al menos un destino falló → fallar el run para que Trigger.dev reintente
  // (los destinos que sí recibieron el evento pueden duplicar: la entrega es
  // at-least-once y el receptor deduplica por `id`).
  if (summary.failed > 0) {
    throw new Error(
      `${summary.failed} de ${summary.results.length} webhooks fallaron: ${summary.firstError ?? "error desconocido"}`
    );
  }

  return { delivered: summary.delivered, failed: 0 };
}
