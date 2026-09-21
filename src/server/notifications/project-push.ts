import { eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { sendPushNotificationToUser, type PushNotificationPayload } from "./push";

/**
 * project-push.ts — Push web narrado al propietario del proyecto
 * (Sprint 3, idea #6).
 *
 * `emitProjectEvent` lo invoca tras narrar la alerta: el propietario recibe
 * en su dispositivo la narración IA (o el fallback determinista) del evento.
 * Fire-and-forget: devuelve { sent, failed } y nunca lanza.
 */

/** Metadatos de notificación por tipo de evento (título/URL de destino). */
const EVENT_META: Record<
  string,
  { title: string; url: (projectId: string) => string }
> = {
  "finding.critical": {
    title: "🔴 Hallazgo crítico",
    url: (projectId) => `/dashboard/projects/${projectId}/security`,
  },
  "anomaly.detected": {
    title: "📈 Anomalías detectadas",
    url: (projectId) => `/dashboard/projects/${projectId}/monitoring`,
  },
  "uptime.down": {
    title: "⚠️ Caída de disponibilidad",
    url: (projectId) => `/dashboard/projects/${projectId}/monitoring`,
  },
};

export async function pushProjectEventToOwner(
  projectId: string,
  event: string,
  narrative: string | null,
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  try {
    const [project] = await directDb
      .select({ ownerId: projects.ownerId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { sent: 0, failed: 0 };

    const meta = EVENT_META[event] ?? {
      title: "Nueva alerta",
      url: (id: string) => `/dashboard/projects/${id}`,
    };

    const domain = typeof data.domain === "string" ? data.domain : project.name;
    const payload: PushNotificationPayload = {
      title: meta.title,
      body: narrative ?? `Nueva alerta en ${domain}. Revise el panel para más detalles.`,
      tag: `${event}:${projectId}`,
      url: meta.url(projectId),
      data: { event, projectId },
    };

    const result = await sendPushNotificationToUser(project.ownerId, payload);
    return { sent: result.sent, failed: result.failed };
  } catch {
    // El push es best-effort: jamás rompe al emisor del evento.
    return { sent: 0, failed: 0 };
  }
}
