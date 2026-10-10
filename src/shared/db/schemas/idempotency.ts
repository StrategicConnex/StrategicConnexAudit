/**
 * idempotency.ts — Claves de idempotencia de endpoints mutadores (A6)
 *
 * Garantía de "efecto a lo sumo una vez": el cliente envía `Idempotency-Key`;
 * el servidor reclama la fila con `INSERT … ON CONFLICT DO NOTHING` y, si ya
 * existe, sirve la respuesta guardada en lugar de repetir el trabajo (crear
 * otra webhook, otro job de informe, otro run).
 *
 * Acceso: SOLO el backend vía `directDb`. RLS habilitada SIN policies
 * (patrón `rate_limit_windows`, ADR-002) → anon/authenticated denegados por
 * defecto. La tabla no vive en la transacción del dominio, así que no
 * necesita grants ni policies para `authenticated`.
 */

import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Valor de la cabecera `Idempotency-Key` aportado por el cliente. */
    scopeKey: text("scope_key").notNull(),
    /** Usuario propietario; la clave no cruza usuarios. */
    userId: uuid("user_id").notNull(),
    /** Identificador lógico del endpoint (p.ej. `POST /api/webhooks`). */
    endpoint: text("endpoint").notNull(),
    /** SHA-256 del cuerpo: detecta reutilización de la clave con otro payload. */
    requestHash: text("request_hash").notNull(),

    /** `in_progress` | `completed`. */
    status: text("status").notNull().default("in_progress"),
    /** Respuesta guardada para el replay. */
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Base del barrido de filas caducadas. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("uq_idempotency_scope").on(t.endpoint, t.userId, t.scopeKey),
    index("idx_idempotency_expires_at").on(t.expiresAt),
  ],
);
