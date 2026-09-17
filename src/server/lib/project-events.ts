/**
 * project-events.ts — Eventos salientes por proyecto (B-3).
 *
 * Los productores (uptime, anomalías, assessments) emiten aquí; el task
 * `dispatch-webhook-task` entrega a los webhooks suscritos del proyecto
 * (con reintentos). Fire-and-forget: jamás rompe al productor.
 */

export type ProjectOutboundEvent = "finding.critical" | "anomaly.detected" | "uptime.down";

export async function emitProjectEvent(
  projectId: string,
  event: ProjectOutboundEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Import dinámico: evita ciclos (los triggers importan este helper).
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("dispatch-webhook-task", { projectId, event, data });
  } catch {
    // Silencio deliberado: el evento es notificación, no parte del flujo.
  }
}
