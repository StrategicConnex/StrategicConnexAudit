/**
 * src/instrumentation-client.ts — inicialización de Sentry en el navegador.
 *
 * Reglas del proyecto (costo cero + privacidad):
 *  - DSN por `NEXT_PUBLIC_SENTRY_DSN` (público por diseño, no es secreto).
 *  - Session Replay DESACTIVADO por defecto: graba pantalla e interacciones
 *    del usuario (PII) y consume cuota del plan gratuito. Se habilita solo
 *    con `NEXT_PUBLIC_SENTRY_REPLAY=true` y consentimiento explícito.
 *  - `beforeSend` limpia cabeceras sensibles y contexto de usuario.
 *  - Trazas al 10% en producción para cuidar la cuota.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const replayEnabled = process.env.NEXT_PUBLIC_SENTRY_REPLAY === "true";

const REDACTED_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
]);

// Genérica para conservar el tipo concreto del evento (ErrorEvent vs
// TransactionEvent) en los hooks `beforeSend*`.
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

  integrations: replayEnabled ? [Sentry.replayIntegration()] : [],

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  replaysSessionSampleRate: replayEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: replayEnabled ? 1.0 : 0,

  beforeSend(event) {
    return scrubEvent(event);
  },
  beforeSendTransaction(event) {
    return scrubEvent(event);
  },

  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
