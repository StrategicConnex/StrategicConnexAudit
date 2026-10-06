/**
 * webhook-events.ts — Catálogo canónico de eventos salientes (Tanda 4 / B7).
 *
 * MOTIVO: hasta ahora la UI de Settings ofrecía `audit.completed` y
 * `alert.triggered`, eventos que NINGÚN productor emitía. El cliente se
 * suscribía a algo que no existe y su endpoint no recibía jamás nada — la
 * funcionalidad estaba muerta y mentía.
 *
 * Este módulo es la única fuente de verdad:
 *  - `POST /api/webhooks` rechaza ids fuera del catálogo (antes aceptaba
 *    cualquier string: `z.array(z.string())`).
 *  - La UI construye los checkboxes desde `WEBHOOK_EVENTS`, no a mano.
 *  - Cada entrada declara sus `emitters` (rutas reales del repo). Un test
 *    verifica que el id aparece en esas fuentes: un evento huérfano rompe la
 *    suite en vez de mentirle al cliente.
 *
 * `webhook.test` es un evento de entrega, no de suscripción: solo lo usa el
 * endpoint de prueba, por eso vive fuera de `WEBHOOK_EVENTS`.
 */

/** Eventos a los que un cliente puede suscribirse. */
export const WEBHOOK_EVENT_IDS = [
  "finding.created",
  "finding.critical",
  "anomaly.detected",
  "uptime.down",
] as const;

export type WebhookEventId = (typeof WEBHOOK_EVENT_IDS)[number];

/** Evento sintético del botón "Enviar prueba". Nunca se suscribe ni se emite solo. */
export const WEBHOOK_TEST_EVENT = "webhook.test";

export interface WebhookEventDef {
  id: WebhookEventId;
  /** Token camelCase para las claves i18n `webhookEvent<Token>Label` / `...Desc`. */
  i18nToken: string;
  /** Rutas del repo que emiten el evento (verificadas por test). */
  emitters: string[];
  /** Forma del payload, para la documentación y la UI. */
  sample: Record<string, unknown>;
}

export const WEBHOOK_EVENTS: readonly WebhookEventDef[] = [
  {
    id: "finding.created",
    i18nToken: "FindingCreated",
    emitters: [
      "src/app/api/intelligence/route.ts",
      "src/app/api/intelligence/runs/route.ts",
      "src/app/api/intelligence/investigations/route.ts",
    ],
    sample: { count: 3, severities: { critical: 1, high: 2 } },
  },
  {
    id: "finding.critical",
    i18nToken: "FindingCritical",
    emitters: ["src/server/intelligence/adversary/assessment/assessment-service.ts"],
    sample: { title: "TLS 1.0 habilitado", cweId: "CWE-326", cvssScore: 8.1 },
  },
  {
    id: "anomaly.detected",
    i18nToken: "AnomalyDetected",
    emitters: ["src/trigger/anomaly.trigger.ts"],
    sample: { totalAnomalies: 4, domain: "acme.com" },
  },
  {
    id: "uptime.down",
    i18nToken: "UptimeDown",
    emitters: ["src/trigger/uptime.trigger.ts"],
    sample: { url: "https://acme.com", statusCode: 503 },
  },
];

const BY_ID = new Map<string, WebhookEventDef>(WEBHOOK_EVENTS.map((e) => [e.id, e]));

/** Suscripción por defecto de un webhook nuevo (los dos eventos accionables). */
export const DEFAULT_WEBHOOK_EVENTS: readonly WebhookEventId[] = ["finding.critical", "uptime.down"];

export function isWebhookEvent(value: unknown): value is WebhookEventId {
  return typeof value === "string" && BY_ID.has(value);
}

/** Definición del evento, o null si no pertenece al catálogo. */
export function getWebhookEvent(id: string): WebhookEventDef | null {
  return BY_ID.get(id) ?? null;
}

/** Clave i18n (`settings`) de la etiqueta del evento. */
export function webhookEventLabelKey(id: WebhookEventId): string {
  const def = getWebhookEvent(id);
  return `webhookEvent${def?.i18nToken ?? id}Label`;
}

/** Clave i18n (`settings`) de la descripción del evento. */
export function webhookEventDescriptionKey(id: WebhookEventId): string {
  const def = getWebhookEvent(id);
  return `webhookEvent${def?.i18nToken ?? id}Desc`;
}

/** Todos los ids válidos, para mensajes de error y documentación. */
export function listWebhookEventIds(): WebhookEventId[] {
  return WEBHOOK_EVENTS.map((e) => e.id);
}
