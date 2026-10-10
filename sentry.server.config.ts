/**
 * sentry.server.config.ts — inicialización de Sentry en el runtime Node.
 *
 * Reglas del proyecto (costo cero + privacidad):
 *  - El DSN NUNCA se escribe literal en el código: viene de
 *    `NEXT_PUBLIC_SENTRY_DSN`. Si falta, el SDK queda inactivo y la app
 *    arranca igual (ningún `throw` en el arranque).
 *  - `tracesSampleRate` bajo en producción: el plan gratuito tiene cuota de
 *    eventos y trazar al 100% la agota en días.
 *  - `beforeSend` elimina PII (cookies, cabeceras de autorización, cuerpos de
 *    petición y contexto de usuario) antes de que salga del servidor.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Claves cuyo valor nunca debe viajar a Sentry. */
const REDACTED_HEADERS = new Set([
  "cookie",
  "set-cookie",
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
]);

// Genérica para conservar el tipo concreto del evento que recibe el hook
// (`beforeSend` espera ErrorEvent).
//
// NOTA (SDK 11.4.0): aquí NO hay `beforeSendTransaction` a propósito. Con
// `traceLifecycle` en `'stream'` —el default, que es el nuestro— el SDK lo
// ignora en silencio (`maybeWarnAboutIgnoredTransactionOptions` en
// `@sentry/core`) y lo eliminará en la v12, así que mantenerlo solo daría una
// falsa sensación de seguridad. El día que haga falta scrub de trazas se usa
// `beforeSendSpan`/`ignoreSpans`, que sí operan con span streaming.
export const scrubEvent = <T extends Sentry.Event>(event: T): T => {
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
    // Cuerpos de petición: pueden contener contraseñas y tokens.
    delete request.data;
    delete request.cookies;
  }

  // IP del usuario y datos de usuario van en `user`; no se necesitan para
  // depurar errores del servidor.
  delete event.user;

  return event;
};

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,

  // 10% en producción, 100% en local para poder depurar a fondo.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,

  beforeSend(event) {
    return scrubEvent(event);
  },

  // Privacy by default. `false` en `CollectBehavior` significa "no recolectes
  // nada": las cabeceras (que venían con `{ request: true, response: true }`
  // por defecto) y las cookies (que venían a `true`) dejan de salir del
  // proceso, en vez de salir y confiar en que el SDK las filtre.
  //
  // El scrub de `beforeSend` se queda como segunda barrera por si alguien
  // vuelve a activar la recolección: no sustituye a este corte, lo respalda.
  dataCollection: {
    userInfo: false,
    httpHeaders: false,
    cookies: false,
    httpBodies: [],
  },
});
