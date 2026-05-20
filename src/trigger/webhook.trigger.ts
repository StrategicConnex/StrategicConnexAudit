import { logger, task } from "@trigger.dev/sdk/v3";
import { db } from "@/shared/db";
import { webhookConfigs } from "@/shared/db/schemas";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export interface WebhookPayload {
  projectId: string;
  event: string;
  data: any;
}

// Tarea asíncrona para despachar webhooks a clientes (con reintentos automáticos)
export const dispatchWebhookTask = task({
  id: "dispatch-webhook-task",
  maxRetries: 5, // Trigger.dev manejará backoff exponencial automáticamente
  run: async (payload: WebhookPayload, { ctx }) => {
    logger.info(`Iniciando envío de webhook event '${payload.event}' para proyecto ${payload.projectId}`);

    // Buscar configuraciones de webhook activas para este evento y proyecto
    const configs = await db.query.webhookConfigs.findMany({
      where: and(
        eq(webhookConfigs.projectId, payload.projectId),
        eq(webhookConfigs.active, true)
      )
    });

    if (configs.length === 0) {
      logger.info("No hay webhooks activos configurados para este proyecto.");
      return { delivered: 0 };
    }

    let deliveredCount = 0;

    for (const config of configs) {
      // Verificar si está suscrito al evento específico
      const subscribedEvents = Array.isArray(config.events) ? config.events : [];
      if (subscribedEvents.length > 0 && !subscribedEvents.includes(payload.event) && !subscribedEvents.includes("*")) {
        continue;
      }

      try {
        const body = JSON.stringify({
          id: ctx.run.id,
          event: payload.event,
          timestamp: new Date().toISOString(),
          data: payload.data
        });

        // Firmar el payload con el secret
        const signature = crypto
          .createHmac("sha256", config.secretToken)
          .update(body)
          .digest("hex");

        logger.info(`Haciendo POST a ${config.url}`);
        
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "StrategicAudit-Webhook/1.0",
            "X-StrategicAudit-Signature": `sha256=${signature}`,
            "X-StrategicAudit-Event": payload.event
          },
          body
        });

        if (!response.ok) {
          throw new Error(`Endpoint respondió con status ${response.status}: ${response.statusText}`);
        }

        deliveredCount++;
        logger.info(`Webhook enviado exitosamente a ${config.url}`);

      } catch (err: any) {
        logger.error(`Fallo al enviar webhook a ${config.url}: ${err.message}`);
        // Lanzamos el error para que Trigger.dev capture el fallo y reintente este run
        throw err; 
      }
    }

    return { delivered: deliveredCount };
  },
});
