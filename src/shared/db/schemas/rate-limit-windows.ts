/**
 * rate-limit-windows.ts — Ventanas de rate limit distribuidas (ADR-002 enmienda 15)
 *
 * Sustituye el store exclusivamente en memoria de `ratelimit.ts` tras la
 * eliminación de Upstash (enmienda 14): una fila por (prefix, identificador)
 * con el array de timestamps dentro de la ventana, misma semántica sliding
 * window que `checkRateLimitInMemory` pero compartida por todas las
 * instancias serverless.
 *
 * Acceso: sólo el backend vía `directDb` (conexión de servicio, dueña de la
 * tabla). RLS queda habilitada SIN policies, así los roles de aplicación
 * (anon/authenticated) quedan denegados por defecto.
 *
 * Higiene: `checkRateLimitInternal` borra oportunamente (una vez por proceso)
 * las filas con `expires_at` vencido.
 */

import {
  pgTable,
  text,
  bigint,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    /** Prefijo del limiter (ej: "ai_limit", "email_limit", "intel_scan"). */
    prefix: text("prefix").notNull(),

    /** Identificador limitado: IP, user.id o clave anon-* derivada de headers. */
    identifier: text("identifier").notNull(),

    /** Timestamps (epoch ms) dentro de la ventana, orden ascendente. */
    ts: bigint("ts", { mode: "number" }).array().notNull(),

    /** Instante en que la ventana queda vacía; base del sweep de filas vencidas. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.prefix, t.identifier] }),
    index("idx_rate_limit_windows_expires_at").on(t.expiresAt),
  ],
);
