/**
 * scan-queue.ts — Cola de escaneo en Postgres con concurrencia por plan (C3)
 *
 * El escenario original de C3 hablaba de una cola en Redis. El proyecto ya no
 * usa Redis (ADR-002 enmiendas 14–15): la cola vive en Postgres, el mismo
 * `DATABASE_URL`, sin servicios externos. Los workers reclaman trabajo con
 * `FOR UPDATE SKIP LOCKED`, de modo que N workers no se pisan, y el cupo por
 * plan se controla con la tabla de slots `scan_queue_slots`.
 *
 * Acceso: sólo el backend vía `directDb`. RLS habilitada SIN policies (patrón
 * `rate_limit_windows`) → anon/authenticated quedan denegados por defecto.
 *
 * Estados de `scan_queue.status`: `queued` → `running` → (`done` | `failed`).
 * Reintentos: en `failed` transitorio se vuelve a `queued` con backoff
 * exponencial hasta `max_attempts`.
 */

import { pgTable, text, uuid, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const scanQueue = pgTable(
  "scan_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant dueño del job (para reasociar el resultado al proyecto). */
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id"),

    /** Plan de suscripción que fija el cupo de concurrencia. */
    plan: text("plan").notNull().default("free"),

    /** Herramienta a ejecutar y objetivo (dominio/IP). */
    toolId: text("tool_id").notNull(),
    target: text("target").notNull(),
    input: jsonb("input"),

    /** `queued` | `running` | `done` | `failed`. */
    status: text("status").notNull().default("queued"),

    /** Mayor = antes se reclama. */
    priority: integer("priority").notNull().default(0),

    /** Intentos consumidos y techo antes de marcar `failed` definitivo. */
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),

    /** No se reclama antes de este instante (backoff). */
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_scan_queue_claim").on(t.status, t.availableAt),
    index("idx_scan_queue_project").on(t.projectId),
  ],
);

/** Cupo de concurrencia por plan: `active` jobs `running` como máximo. */
export const scanQueueSlots = pgTable("scan_queue_slots", {
  plan: text("plan").primaryKey(),
  active: integer("active").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
