/**
 * app-logs.ts — Sink de observabilidad de errores en Postgres (ADR-007)
 *
 * Retiene los errores de la app (nivel `error`) con historial ilimitado para
 * que los rechecks post-push (T+5m/T+24h) consulten datos propios en lugar
 * de la ventana de minutos de `vercel logs`. Capturas: `instrumentation.ts`
 * (envoltura de `console.error` + hook `onRequestError`) vía
 * `src/server/observability/app-logs-sink.ts`.
 *
 * Acceso: sólo el backend vía `directDb` (conexión de servicio, dueña de la
 * tabla). RLS habilitada SIN policies, así los roles de aplicación
 * (anon/authenticated) quedan denegados por defecto.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const appLogs = pgTable(
  "app_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Instante del error: base de las ventanas de recheck. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    /** Nivel del evento (hoy siempre `error`; columna preparada para warn). */
    level: text("level").notNull().default("error"),

    /** Mensaje truncado (2000 chars) del error o del JSON del logger. */
    message: text("message").notNull(),

    /** Código del error cuando existe (ej. `42501` de Postgres, digest de Next). */
    code: text("code"),

    /** Punto de captura: `console` (console.error envuelto) o `request-error`. */
    source: text("source").notNull(),

    /** Ruta de la petición cuando se conoce. */
    path: text("path"),

    /** Contexto adicional (logger context, digest, ruta de Next), truncado. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("idx_app_logs_created_at").on(t.createdAt)],
);
