/**
 * delivery.ts — Entrega de webhooks salientes (Tanda 4 / B7).
 *
 * Extraído de `webhook.trigger.ts` para poder reutilizarlo desde el endpoint
 * de prueba (POST /api/webhooks/[id]/test) sin duplicar la lógica de firma,
 * cabeceras y validación SSRF. La firma HMAC y el guard de egress son
 * idénticos en ambos caminos: probar EN PRUEBA lo que corre en producción.
 *
 * Todo con dependencias inyectables (fetch, reloj, decrypt, egress, logger)
 * para que sea testeable sin red ni base de datos.
 */

import crypto from "node:crypto";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { decryptField } from "@/server/lib/field-crypto";
import { correlatedHeaders } from "@/lib/request-context";

export interface WebhookDeliveryTarget {
  id: string;
  url: string;
  /** Secret cifrado en reposo (o legacy en claro). */
  secretToken: string;
  /** Eventos suscritos; vacío o con "*" = todos. */
  events: string[] | null;
}

export interface WebhookDeliveryPayload {
  /** id del run de Trigger o del intento de prueba. */
  id: string;
  event: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface WebhookDeliveryResult {
  configId: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface DeliveryDeps {
  fetchImpl: typeof fetch;
  now: () => Date;
  decrypt: (value: string) => string;
  /** Devuelve las direcciones resueltas (o lanza si el host no es público). */
  assertHost: (hostname: string) => Promise<unknown>;
  logger: { info: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export function defaultDeliveryDeps(
  overrides: Partial<DeliveryDeps> = {},
): DeliveryDeps {
  return {
    fetchImpl: globalThis.fetch.bind(globalThis),
    now: () => new Date(),
    decrypt: decryptField,
    assertHost: assertPublicHostname,
    logger: { info: () => {}, error: () => {} },
    ...overrides,
  };
}

/**
 * ¿La configuración escucha este evento? Suscripción vacía = todos (compat con
 * configs antiguas creadas antes de exigir eventos).
 */
export function isSubscribedToEvent(events: string[] | null | undefined, event: string): boolean {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return true;
  return list.includes(event) || list.includes("*");
}

/** Cuerpo exacto que se firmará y se enviará (la firma se calcula sobre él). */
export function buildWebhookBody(payload: WebhookDeliveryPayload, now: Date): string {
  return JSON.stringify({
    id: payload.id,
    event: payload.event,
    timestamp: payload.timestamp ?? now.toISOString(),
    data: payload.data,
  });
}

export function signWebhookBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Entrega el evento a UNA configuración. Nunca lanza: todos los fallos se
 * devuelven en el resultado para que el caller decida (el task reintenta,
 * la prueba informa al usuario).
 */
export async function deliverWebhook(
  target: WebhookDeliveryTarget,
  payload: WebhookDeliveryPayload,
  deps: DeliveryDeps,
): Promise<WebhookDeliveryResult> {
  const base: WebhookDeliveryResult = { configId: target.id, url: target.url, ok: false };
  try {
    const body = buildWebhookBody(payload, deps.now());
    const signature = signWebhookBody(body, deps.decrypt(target.secretToken));

    // SECURITY: la URL no puede apuntar a IPs privadas / metadata (SSRF).
    const parsedUrl = new URL(target.url);
    await deps.assertHost(parsedUrl.hostname);

    deps.logger.info(`[webhook] POST ${target.url}`);
    const response = await deps.fetchImpl(target.url, {
      method: "POST",
      headers: correlatedHeaders({
        "Content-Type": "application/json",
        "User-Agent": "StrategicAudit-Webhook/1.0",
        "X-StrategicAudit-Signature": `sha256=${signature}`,
        "X-StrategicAudit-Event": payload.event,
      }),
      body,
    });

    if (!response.ok) {
      return { ...base, status: response.status, error: `Endpoint respondió con status ${response.status}: ${response.statusText}` };
    }
    return { ...base, ok: true, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.error(`[webhook] Fallo al enviar a ${target.url}: ${message}`);
    return { ...base, error: message };
  }
}

export interface DeliverAllSummary {
  delivered: number;
  failed: number;
  results: WebhookDeliveryResult[];
  /** Mensaje del primer fallo, para que el task reintente con contexto. */
  firstError: string | null;
}

/** Entrega a todas las configuraciones suscritas. Nunca lanza. */
export async function deliverWebhooks(
  targets: WebhookDeliveryTarget[],
  payload: WebhookDeliveryPayload,
  deps: DeliveryDeps,
): Promise<DeliverAllSummary> {
  const subscribed = targets.filter((t) => isSubscribedToEvent(t.events, payload.event));
  const results: WebhookDeliveryResult[] = [];

  for (const target of subscribed) {
    results.push(await deliverWebhook(target, payload, deps));
  }

  const failed = results.filter((r) => !r.ok);
  return {
    delivered: results.length - failed.length,
    failed: failed.length,
    results,
    firstError: failed[0]?.error ?? null,
  };
}
