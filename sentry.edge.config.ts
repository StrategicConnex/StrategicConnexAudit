/**
 * sentry.edge.config.ts — inicialización de Sentry para edge features
 * (proxy/middleware y route handlers en edge).
 *
 * Réplica de `sentry.server.config.ts` para el runtime edge. El edge no
 * soporta `node:` APIs, así que el scrub se reimplementa de forma mínima y
 * equivalente sobre el objeto `request` del evento.
 *
 * @see sentry.server.config.ts para el detalle de las reglas (DSN por env,
 * muestreo bajo en producción, PII fuera).
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const REDACTED_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
]);

// Genérica para conservar el tipo concreto del evento que recibe el hook.
//
// Sin `beforeSendTransaction` a propósito: con el `traceLifecycle: 'stream'`
// por defecto del SDK 11.x ese hook se ignora (ver sentry.server.config.ts),
// así que no se registra para no prometer un scrub que no ocurre.
const scrubEvent = <T extends Sentry.Event>(event: T): T => {
  const request = event.request as
    | { headers?: Record<string, unknown>; data?: unknown; cookies?: unknown }
    | undefined;

  if (request) {
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (REDACTED_HEADERS.has(name.toLowerCase())) {
          request.headers[name] = "[Filtered]";
        }
      }
    }
    delete request.data;
    delete request.cookies;
  }

  delete event.user;

  return event;
};

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  beforeSend(event) {
    return scrubEvent(event);
  },

  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
});
