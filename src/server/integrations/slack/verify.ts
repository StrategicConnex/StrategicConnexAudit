import crypto from "node:crypto";

/**
 * verify.ts — Verificación de requests de Slack (Tanda 4 / B16).
 *
 * Slack firma cada request saliente con HMAC-SHA256 sobre
 * `v0:{X-Slack-Request-Timestamp}:{cuerpo crudo}` usando el signing secret de
 * la app. Sin esta verificación cualquiera podría POSTear comandos al bot.
 *
 * Módulo puro (sin red, sin env): el secreto y el reloj se inyectan.
 */

/** Slack recomienda rechazar requests con más de 5 minutos (anti-replay). */
export const SLACK_MAX_TIMESTAMP_SKEW_SECONDS = 300;

export type SlackVerification =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_headers" | "stale_timestamp" | "bad_signature" };

export interface VerifySlackRequestInput {
  /** Cuerpo CRUDO (texto exacto recibido): reserializarlo invalida la firma. */
  body: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  /** Segundos epoch; inyectable para tests. */
  now?: number;
}

export function verifySlackRequest(input: VerifySlackRequestInput): SlackVerification {
  if (!input.signingSecret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!input.timestamp || !input.signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SLACK_MAX_TIMESTAMP_SKEW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const baseString = `v0:${input.timestamp}:${input.body}`;
  const expected = `v0=${crypto
    .createHmac("sha256", input.signingSecret)
    .update(baseString)
    .digest("hex")}`;

  return timingSafeEqual(expected, input.signature)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige la misma longitud: comparar longitudes primero
  // filtraría la longitud de la firma, así que se comparan digests de tamaño
  // fijo (SHA-256) de ambos valores.
  const digestA = crypto.createHash("sha256").update(bufA).digest();
  const digestB = crypto.createHash("sha256").update(bufB).digest();
  return crypto.timingSafeEqual(digestA, digestB) && bufA.length === bufB.length;
}
