import { checkAiDailyQuota } from "@/shared/lib/ratelimit";

/**
 * narrated-alerts.ts — Alertas narradas por IA (Sprint 3, idea #6).
 *
 * Narración corta (2-4 frases, español) para eventos salientes del proyecto
 * (finding.critical, anomaly.detected, uptime.down). La narración viaja en
 * `data.narrative` hacia webhooks y es la base del push al propietario.
 *
 * Diseño:
 *  - Anti-coste: task type `narrated-alert` (texto corto, router con
 *    openrouter/free, 20s). Cuota diaria POR PROYECTO (40/día) medida con la
 *    infraestructura de cuotas Redis de ratelimit.ts usando el projectId como
 *    identificador: agotada → null y la alerta sale con fallback determinista
 *    (el webhook/push nunca se pierde por culpa de la IA).
 *  - Fire-and-forget por contrato: nunca lanza; los productores llaman
 *    `narrateAlert()` antes de `emitProjectEvent`.
 */

/** Eventos narrables (coincide con ProjectOutboundEvent de project-events.ts). */
export type NarratableEvent = "finding.critical" | "anomaly.detected" | "uptime.down";

/** Fallback determinista si la IA no está disponible o el proyecto agotó cuota. */
export function fallbackNarration(event: NarratableEvent, domain: string): string {
  switch (event) {
    case "finding.critical":
      return `Hallazgo crítico detectado en ${domain}. Revise el panel para ver los detalles y las acciones recomendadas.`;
    case "anomaly.detected":
      return `Se han detectado anomalías en ${domain} durante las últimas 24 horas. Revise el panel de monitoreo.`;
    case "uptime.down":
      return `Se ha detectado una caída de disponibilidad en ${domain}. Estamos verificando el estado del sitio.`;
    default:
      return `Nueva alerta en ${domain}. Revise el panel para ver los detalles.`;
  }
}

/**
 * Cuota diaria por proyecto (protección anti-coste): 40 narraciones/día,
 * medida con la infraestructura de cuotas Redis ya existente (ratelimit.ts)
 * usando el projectId como identificador de cuota.
 */
export const NARRATED_ALERT_DAILY_QUOTA = 40;

/**
 * Narrar una alerta con IA. Devuelve null si no hay narración posible
 * (cuota agotada, sin key, salida vacía) — el caller usa fallbackNarration().
 *
 * El contador de cuota consume SOLO cuando la IA responde (no en fallo),
 * de modo que un proveedor caído no quema la cuota del día.
 */
export async function narrateAlert(
  event: NarratableEvent,
  ctx: { projectId: string; domain: string; data: Record<string, unknown> }
): Promise<string | null> {
  // Cuota previa: si el proyecto ya gastó las 40 del día, ni intentarlo.
  try {
    const pre = await checkAiDailyQuota(ctx.projectId, "narrated-alert");
    if (!pre.success) return null;
  } catch {
    // Cuota indisponible: continuar (la llamada IA tiene sus propios límites).
  }

  try {
    const { callAIWithFallback } = await import("./ai-router");
    const res = await callAIWithFallback({
      taskType: "narrated-alert",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de ciberseguridad. Con los datos del evento, redacta en español " +
            "2-4 frases: qué pasó, por qué importa y primera acción. Sin jerga innecesaria, " +
            "sin inventar datos, sin markdown, texto plano para notificación.",
        },
        {
          role: "user",
          content: buildAlertPrompt(event, ctx.domain, ctx.data),
        },
      ],
      temperature: 0.3,
      maxTokens: 250,
      cacheScope: `alert:${ctx.projectId}`,
    });
    if (!res.success || !res.content) return null;
    return res.content.trim().slice(0, 600);
  } catch {
    return null;
  }
}

function buildAlertPrompt(
  event: NarratableEvent,
  domain: string,
  data: Record<string, unknown>
): string {
  switch (event) {
    case "finding.critical": {
      const finding = (data.finding ?? {}) as { title?: string; severity?: string };
      return (
        `Evento: hallazgo crítico en ${domain}.\n` +
        `Hallazgo: ${finding.title ?? "n/d"} (severidad ${finding.severity ?? "critical"}).\n` +
        `Redacta la alerta para el propietario del proyecto.`
      );
    }
    case "anomaly.detected": {
      const n = typeof data.totalAnomalies === "number" ? data.totalAnomalies : "varias";
      return (
        `Evento: anomalías detectadas en ${domain}.\n` +
        `Total: ${n} en las últimas 24h.\n` +
        `Redacta la alerta para el propietario del proyecto.`
      );
    }
    case "uptime.down": {
      const url = typeof data.url === "string" ? data.url : domain;
      const code = data.statusCode != null ? ` (HTTP ${data.statusCode})` : "";
      return (
        `Evento: caída de disponibilidad en ${domain}.\n` +
        `URL afectada: ${url}${code}.\n` +
        `Redacta la alerta para el propietario del proyecto.`
      );
    }
  }
}
