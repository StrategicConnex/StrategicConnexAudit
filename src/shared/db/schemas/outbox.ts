/**
 * outbox.ts — Outbox de eventos salientes (C6)
 *
 * El productor inserta la fila en la MISMA transacción que el cambio de
 * dominio (dentro de `withRLS`), así el evento no se pierde si el commit
 * falla ni se emite si la transacción revierte. Un drenador reclama filas
 * `pending` con `FOR UPDATE SKIP LOCKED` (misma mecánica que `scan_queue`) y
 * las despacha; los fallos reintentan con backoff exponencial hasta
 * `max_attempts`.
 *
 * RLS: el rol `authenticated` solo tiene GRANT INSERT + policy de inserción
 * para proyectos accesibles (ver 0041). La lectura/actualización la hace el
 * drenador con `directDb` (dueño de la tabla → bypass de RLS).
 */

import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tipo de evento saliente (p.ej. `finding.created`). */
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type"),
    aggregateId: text("aggregate_id"),
    /** Proyecto dueño del evento (nullable para eventos globales). */
    projectId: uuid("project_id"),
    payload: jsonb("payload").notNull().default({}),

    /** Deduplicación opcional aportada por el productor. */
    dedupeKey: text("dedupe_key"),

    /** `pending` | `processing` | `done` | `failed`. */
    status: text("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(0),

    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),

    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_outbox_dedupe").on(t.dedupeKey),
    index("idx_outbox_claim").on(t.status, t.availableAt),
  ],
);
