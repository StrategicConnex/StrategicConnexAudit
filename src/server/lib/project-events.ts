/**
 * project-events.ts — Eventos salientes por proyecto (B-3) + narración IA
 * y push al propietario (Sprint 3, idea #6).
 *
 * Los productores (uptime, anomalías, assessments) emiten aquí. Cada evento:
 *  1. Se narra con IA (2-4 frases en español) — `narrateAlert`, con cuota
 *     por proyecto y fallback determinista si la IA no está disponible.
 *  2. Se envía push web al propietario del proyecto (si tiene suscripciones
 *     activas) — fire-and-forget.
 *  3. Se entrega a los webhooks suscritos vía `dispatch-webhook-task`
 *     (con reintentos).
 *
 * Fire-and-forget de extremo a extremo: jamás rompe al productor.
 */

import type { NarratableEvent } from "@/server/ai/narrated-alerts";

export type ProjectOutboundEvent = NarratableEvent;

export async function emitProjectEvent(
  projectId: string,
  event: ProjectOutboundEvent,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // 1. Narración IA (barata, con cuota por proyecto; nunca lanza).
    //    Si la IA no narra (fallo, sin key, cuota), el fallback determinista
    //    garantiza que push y webhook SIEMPRE lleven texto.
    const domain = typeof data.domain === "string" ? data.domain : "el proyecto";
    let narrative: string | null = null;
    try {
      const { narrateAlert } = await import("@/server/ai/narrated-alerts");
      narrative = await narrateAlert(event, { projectId, domain, data });
    } catch {
      narrative = null;
    }
    if (narrative == null) {
      try {
        const { fallbackNarration } = await import("@/server/ai/narrated-alerts");
        narrative = fallbackNarration(event, domain);
      } catch {
        narrative = null;
      }
    }

    // 2. Push web narrado al propietario (fire-and-forget).
    try {
      const { pushProjectEventToOwner } = await import("@/server/notifications/project-push");
      await pushProjectEventToOwner(projectId, event, narrative, data);
    } catch {
      // El push es best-effort: nunca rompe el evento.
    }

    // 3. Webhooks suscritos (con la narración incluida en el payload).
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("dispatch-webhook-task", {
      projectId,
      event,
      data: narrative ? { ...data, narrative } : data,
    });
  } catch {
    // Silencio deliberado: el evento es notificación, no parte del flujo.
  }
}
