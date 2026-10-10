/**
 * outbox.ts — Store y productor del outbox de eventos salientes (C6)
 *
 * El PRODUCTOR (`enqueueOutboxEvent`) escribe la fila dentro de la misma
 * transacción que el cambio de dominio: si el commit revierte, el evento no
 * existe; si commitea, el evento está garantizado. El DRENADOR reclama filas
 * `pending` con `FOR UPDATE SKIP LOCKED` (misma mecánica que `scan_queue`) y
 * reintenta con backoff exponencial.
 *
 * El insert del productor corre como rol `authenticated` (dentro de
 * `withRLS`), por eso 0041 le da GRANT INSERT + policy de acceso al proyecto.
 * El drenador y el store usan `directDb` (dueño de la tabla → bypass de RLS).
 */

import { sql, type SQL } from "drizzle-orm";
import { logger } from "@/lib/logger";

export type SqlExec = (query: SQL) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

export interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  project_id: string | null;
  payload: unknown;
  dedupe_key: string | null;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: string | Date;
  claimed_at: string | Date | null;
  claimed_by: string | null;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface EnqueueOutboxInput {
  eventType: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  projectId?: string | null;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
  priority?: number;
  maxAttempts?: number;
}

export interface OutboxStore {
  claim(workerId: string): Promise<OutboxRow | null>;
  complete(id: string): Promise<boolean>;
  fail(id: string, error: string): Promise<{ status: string; attempts: number } | null>;
  stats(): Promise<Array<{ status: string; n: number }>>;
}

export function createPostgresOutbox(exec: SqlExec): OutboxStore {
  return {
    async claim(workerId: string) {
      const res = await exec(sql`
        WITH candidate AS (
          SELECT id FROM outbox_events
          WHERE status = 'pending' AND available_at <= now()
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events j
        SET status = 'processing', claimed_at = now(), claimed_by = ${workerId}, updated_at = now()
        WHERE j.id = (SELECT id FROM candidate)
        RETURNING j.*
      `);
      return (res.rows[0] as OutboxRow | undefined) ?? null;
    },

    async complete(id: string): Promise<boolean> {
      const res = await exec(sql`
        UPDATE outbox_events
        SET status = 'done', updated_at = now(), claimed_at = NULL, claimed_by = NULL
        WHERE id = ${id} AND status = 'processing'
        RETURNING 1 AS ok
      `);
      return res.rows.length > 0;
    },

    async fail(id: string, error: string) {
      const res = await exec(sql`
        UPDATE outbox_events
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
            last_error = ${error},
            available_at = CASE
              WHEN attempts + 1 >= max_attempts THEN available_at
              ELSE now() + make_interval(secs => LEAST(3600, power(2, attempts) * 10))
            END,
            claimed_at = NULL, claimed_by = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'processing'
        RETURNING status, attempts
      `);
      return (res.rows[0] as { status: string; attempts: number } | undefined) ?? null;
    },

    async stats() {
      const res = await exec(sql`
        SELECT status, count(*)::int AS n FROM outbox_events GROUP BY status ORDER BY status
      `);
      return res.rows as Array<{ status: string; n: number }>;
    },
  };
}

/**
 * Encola un evento DENTRO de una transacción drizzle existente (el `tx` de
 * `withRLS`). Tipado laxo a propósito: solo necesita `insert(...).values(...)`.
 */
export interface OutboxTx {
  insert: (table: unknown) => { values: (row: Record<string, unknown>) => unknown };
}

export function enqueueOutboxEvent(
  tx: OutboxTx,
  table: unknown,
  input: EnqueueOutboxInput,
): unknown {
  return tx.insert(table).values({
    eventType: input.eventType,
    aggregateType: input.aggregateType ?? null,
    aggregateId: input.aggregateId ?? null,
    projectId: input.projectId ?? null,
    payload: input.payload,
    dedupeKey: input.dedupeKey ?? null,
    priority: input.priority ?? 0,
    maxAttempts: input.maxAttempts ?? 8,
  });
}

let store: OutboxStore | null = null;

async function directExec(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> {
  const { directDb } = await import("@/shared/db");
  return (await directDb.execute(query)) as unknown as { rows: unknown[]; rowCount?: number | null };
}

/** Outbox activo (singleton por proceso, conexión de servicio). */
export function getOutbox(): OutboxStore {
  store ??= createPostgresOutbox(directExec);
  return store;
}

/**
 * Despierta al drenador tras commitear (optimización de latencia). El registro
 * en `outbox_events` es la garantía durable; este disparo solo adelanta la
 * entrega. Nunca lanza: si Trigger.dev no responde, el evento sigue `pending`
 * y lo reclamará el próximo drenado.
 */
export async function wakeOutboxDrain(): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger("drain-outbox-task", {});
  } catch (error) {
    logger.warn("[outbox] no se pudo despertar al drenador:", error);
  }
}

/** Productor no transaccional (fuera de `withRLS`): escribe vía directDb. */
export async function emitOutboxEvent(input: EnqueueOutboxInput): Promise<string | null> {
  try {
    const { directDb } = await import("@/shared/db");
    const { outboxEvents } = await import("@/shared/db/schemas");
    const [row] = await directDb
      .insert(outboxEvents)
      .values({
        eventType: input.eventType,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        projectId: input.projectId ?? null,
        payload: input.payload,
        dedupeKey: input.dedupeKey ?? null,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? 8,
      })
      .returning({ id: outboxEvents.id });
    return row?.id ?? null;
  } catch (error) {
    logger.error("[outbox] no se pudo encolar el evento", {
      eventType: input.eventType,
      message: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return null;
  }
}
