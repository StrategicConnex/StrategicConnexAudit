import "server-only";
import { and, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { webhookConfigs } from "@/shared/db/schemas";
import { logger } from "@/lib/logger";
import { currentCorrelationId } from "@/lib/request-context";
import type { WebhookEventId } from "@/shared/lib/webhook-events";

/**
 * emit.ts — Productores de eventos webhook (Tanda 4 / B7).
 *
 * A diferencia de `emitProjectEvent` (que narra con IA y hace push al
 * propietario), este camino es deliberadamente silencioso: encola el evento
 * tal cual. Es el correcto para eventos de VOLUMEN (los hallazgos de un
 * escaneo pueden ser decenas), donde narrar cada uno quemaría la cuota de IA
 * y llenaría la bandeja del propietario.
 *
 * Coste: si el proyecto no tiene ningún webhook activo no se encola nada, así
 * que suscribirse es lo que crea el trabajo (no se gastan runs de Trigger.dev
 * por proyectos que no usan la función).
 *
 * Contrato: fire-and-forget. Jamás lanza ni bloquea al productor.
 */
/**
 * Datos de `finding.created`: cuántos hallazgos nacieron y su reparto por
 * severidad. Es lo que el cliente necesita para decidir sin pedir más datos.
 */
export function findingCreatedData(findings: Array<{ severity: string }>): {
  count: number;
  severities: Record<string, number>;
} {
  const severities: Record<string, number> = {};
  for (const f of findings) {
    severities[f.severity] = (severities[f.severity] ?? 0) + 1;
  }
  return { count: findings.length, severities };
}

export async function emitWebhookEvent(
  projectId: string,
  event: WebhookEventId,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { tasks } = await import("@trigger.dev/sdk");
    const active = await directDb.query.webhookConfigs.findFirst({
      where: and(eq(webhookConfigs.projectId, projectId), eq(webhookConfigs.active, true)),
      columns: { id: true },
    });
    if (!active) return false;

    await tasks.trigger("dispatch-webhook-task", {
      projectId,
      event,
      data,
      correlationId: currentCorrelationId(),
    });
    return true;
  } catch (err) {
    logger.error("[webhooks] no se pudo encolar el evento", {
      event,
      message: (err as Error).message?.slice(0, 200),
    });
    return false;
  }
}
