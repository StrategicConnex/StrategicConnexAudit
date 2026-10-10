/**
 * scan-queue.ts — Cola de escaneo en Postgres con concurrencia por plan (C3).
 *
 * El escenario original hablaba de una cola en Redis; el proyecto ya no usa
 * Redis (ADR-002 enmiendas 14–15). La cola vive en Postgres y los workers
 * reclaman trabajo con `FOR UPDATE SKIP LOCKED`, así N workers no se pisan
 * aunque corran en paralelo. El cupo por plan se controla con la tabla de
 * slots `scan_queue_slots` (reserva atómica vía `INSERT ... ON CONFLICT`).
 *
 * Todo el SQL viaja con parámetros ligados de drizzle; los identificadores
 * (tool_id, target, plan, workerId) nunca se concatenan en el texto SQL.
 *
 * Ciclo de vida del job: `queued` → `running` → (`done` | `failed`), con dos
 * salvaguardas de producción:
 *   * **Contrapresión**: el productor mide la cola activa del proyecto antes de
 *     insertar y rechaza con `QueueFullError` (→ 429 en la ruta) si supera el
 *     límite del plan. Se prefiere un rechazo accionable a un backlog infinito.
 *   * **Purga**: los jobs terminados se borran por retención
 *     (`purgeCompleted`, 14 días) para que la tabla no crezca sin límite.
 */

import { sql, type SQL } from "drizzle-orm";
import { logger } from "@/lib/logger";

export type SqlExec = (query: SQL) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

export interface ScanJobRow {
  id: string;
  project_id: string;
  user_id: string | null;
  plan: string;
  tool_id: string;
  target: string;
  input: unknown;
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

/** Cupo de concurrencia por defecto. Overridable en `claim()`. */
export const PLAN_CONCURRENCY: Record<string, number> = {
  free: 1,
  pro: 4,
  team: 8,
  enterprise: 16,
};
export const DEFAULT_PLAN_CONCURRENCY = 1;

/**
 * Tope absoluto de jobs activos en cola por proyecto (techo de contrapresión).
 * Sin él, un plan alto podría apilar cientos de jobs legítimamente pero inútil-
 * mente: el techo protege la BD de un tenant que encola más de lo que consume.
 */
export const SCAN_QUEUE_MAX_SIZE = 50;

/**
 * Límite de contrapresión de un plan: `concurrencia del plan × 10`, con techo
 * `SCAN_QUEUE_MAX_SIZE`. Escala con el cupo real (free 1→10, pro 4→40) para no
 * castigar a los planes altos, y el techo los iguala sin dejarlos crecer sin
 * fin.
 */
export function queueLimitForPlan(plan: string): number {
  const concurrency = PLAN_CONCURRENCY[plan] ?? DEFAULT_PLAN_CONCURRENCY;
  return Math.min(concurrency * 10, SCAN_QUEUE_MAX_SIZE);
}

/** Días que se conservan los jobs terminados antes de purgarlos. */
export const SCAN_QUEUE_RETENTION_DAYS = 14;

/**
 * Contrapresión: la cola activa del proyecto ya alcanzó el límite de su plan.
 *
 * Es un rechazo **accionable**, no un fallo de infraestructura, y por eso no se
 * confunde con el `null` de "la cola no está disponible": ese `null` degrada al
 * camino síncrono, mientras que este error debe llegar al usuario como un 429.
 */
export class QueueFullError extends Error {
  readonly projectId: string;
  readonly depth: number;
  readonly limit: number;

  constructor(projectId: string, depth: number, limit: number) {
    super(
      "Límite de escaneos en cola alcanzado para este plan. " +
        "Intente más tarde o espere a que se procesen los actuales."
    );
    this.name = "QueueFullError";
    this.projectId = projectId;
    this.depth = depth;
    this.limit = limit;
  }
}

export interface EnqueueScanInput {
  projectId: string;
  userId?: string | null;
  plan?: string;
  toolId: string;
  target: string;
  input?: Record<string, unknown> | null;
  priority?: number;
  maxAttempts?: number;
}

export interface ClaimOptions {
  workerId: string;
  limits?: Record<string, number>;
  defaultLimit?: number;
}

export interface ScanQueue {
  enqueue(job: EnqueueScanInput): Promise<{ id: string; plan: string }>;
  claim(opts: ClaimOptions): Promise<ScanJobRow | null>;
  complete(id: string): Promise<boolean>;
  fail(id: string, error: string): Promise<{ status: string; attempts: number } | null>;
  stats(): Promise<Array<{ status: string; plan: string; n: number }>>;
  /** Borra los jobs terminados (`done`/`failed`) más viejos que la retención. */
  purgeCompleted(retentionDays?: number): Promise<number>;
}

export function createPostgresScanQueue(exec: SqlExec): ScanQueue {
  return {
    async enqueue(job: EnqueueScanInput) {
      const res = await exec(sql`
        INSERT INTO scan_queue (project_id, user_id, plan, tool_id, target, input, priority, max_attempts)
        VALUES (
          ${job.projectId}, ${job.userId ?? null}, ${job.plan ?? "free"}, ${job.toolId}, ${job.target},
          ${job.input ? JSON.stringify(job.input) : null}::jsonb,
          ${job.priority ?? 0}, ${job.maxAttempts ?? 3}
        )
        RETURNING id, plan
      `);
      const row = res.rows[0] as { id: string; plan: string };
      return row;
    },

    async claim({ workerId, limits = PLAN_CONCURRENCY, defaultLimit = DEFAULT_PLAN_CONCURRENCY }: ClaimOptions) {
      const limitsJson = JSON.stringify(limits);
      // Single statement: candidate (lock SKIP LOCKED) → reserva de slot
      // atómica → marca del job como running. Sin slot no hay claim.
      const res = await exec(sql`
        WITH candidate AS (
          SELECT s.id, s.plan
          FROM scan_queue s
          WHERE s.status = 'queued'
            AND s.available_at <= now()
            AND COALESCE((SELECT sl.active FROM scan_queue_slots sl WHERE sl.plan = s.plan), 0)
                < COALESCE((${limitsJson}::jsonb ->> s.plan)::int, ${defaultLimit})
          ORDER BY s.priority DESC, s.created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        ),
        slot AS (
          INSERT INTO scan_queue_slots (plan, active, updated_at)
          SELECT c.plan, 1, now() FROM candidate c
          ON CONFLICT (plan) DO UPDATE
            SET active = scan_queue_slots.active + 1, updated_at = now()
            WHERE scan_queue_slots.active
                  < COALESCE((${limitsJson}::jsonb ->> scan_queue_slots.plan)::int, ${defaultLimit})
          RETURNING plan
        )
        UPDATE scan_queue j
        SET status = 'running', claimed_at = now(), claimed_by = ${workerId}, updated_at = now()
        WHERE j.id = (SELECT id FROM candidate)
          AND EXISTS (SELECT 1 FROM slot)
        RETURNING j.*
      `);
      return (res.rows[0] as ScanJobRow | undefined) ?? null;
    },

    async complete(id: string): Promise<boolean> {
      const res = await exec(sql`
        WITH done AS (
          UPDATE scan_queue
          SET status = 'done', updated_at = now(), claimed_at = NULL, claimed_by = NULL
          WHERE id = ${id} AND status = 'running'
          RETURNING plan
        ),
        released AS (
          UPDATE scan_queue_slots
          SET active = GREATEST(active - 1, 0), updated_at = now()
          WHERE plan IN (SELECT plan FROM done)
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM done)::int AS n
      `);
      return ((res.rows[0] as { n: number } | undefined)?.n ?? 0) > 0;
    },

    async fail(id: string, error: string) {
      const res = await exec(sql`
        WITH bumped AS (
          UPDATE scan_queue
          SET attempts = attempts + 1,
              status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
              last_error = ${error},
              available_at = CASE
                WHEN attempts + 1 >= max_attempts THEN available_at
                ELSE now() + make_interval(secs => LEAST(300, power(2, attempts) * 5))
              END,
              claimed_at = NULL, claimed_by = NULL, updated_at = now()
          WHERE id = ${id} AND status = 'running'
          RETURNING plan, status, attempts
        ),
        released AS (
          UPDATE scan_queue_slots
          SET active = GREATEST(active - 1, 0), updated_at = now()
          WHERE plan IN (SELECT plan FROM bumped)
          RETURNING 1
        )
        SELECT status, attempts FROM bumped
      `);
      const row = res.rows[0] as { status: string; attempts: number } | undefined;
      return row ?? null;
    },

    async stats() {
      const res = await exec(sql`
        SELECT status, plan, count(*)::int AS n FROM scan_queue GROUP BY status, plan ORDER BY status, plan
      `);
      return res.rows as Array<{ status: string; plan: string; n: number }>;
    },

    async purgeCompleted(retentionDays = SCAN_QUEUE_RETENTION_DAYS): Promise<number> {
      // Sólo lo terminado y viejo: `queued`/`running` nunca se purgan (borrarlos
      // perdería trabajo pendiente o dejaría un slot contando un job inexistente).
      // `make_interval` recibe los días como parámetro ligado, no interpolados.
      const res = await exec(sql`
        DELETE FROM scan_queue
        WHERE status IN ('done', 'failed')
          AND updated_at < now() - make_interval(days => ${retentionDays})
      `);
      return res.rowCount ?? 0;
    },
  };
}

/**
 * Profundidad activa de la cola de un proyecto: `queued` + `running`.
 *
 * Es el contador de contrapresión: barato (índice `idx_scan_queue_project`) y
 * ejecutado ANTES del INSERT, para no aceptar trabajo que el plan no puede
 * procesar. Lo terminado (`done`/`failed`) no cuenta: ya no es trabajo.
 */
export async function countActiveScanJobs(exec: SqlExec, projectId: string): Promise<number> {
  const res = await exec(sql`
    SELECT count(*)::int AS n
    FROM scan_queue
    WHERE project_id = ${projectId}
      AND status IN ('queued', 'running')
  `);
  return (res.rows[0] as { n: number } | undefined)?.n ?? 0;
}

let store: ScanQueue | null = null;

async function directExec(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> {
  const { directDb } = await import("@/shared/db");
  return (await directDb.execute(query)) as unknown as { rows: unknown[]; rowCount?: number | null };
}

/** Cola activa (singleton por proceso, conexión de servicio). */
export function getScanQueue(): ScanQueue {
  store ??= createPostgresScanQueue(directExec);
  return store;
}

/**
 * Encola un escaneo de forma tolerante a fallos: si la BD no responde, el
 * llamante puede decidir ejecutar en línea. Devuelve el job o `null`.
 */
export async function enqueueScan(job: EnqueueScanInput): Promise<{ id: string; plan: string } | null> {
  try {
    return await getScanQueue().enqueue(job);
  } catch (error) {
    logger.error("[scan-queue] enqueue falló:", error);
    return null;
  }
}

// ─── Productor (C3) ──────────────────────────────────────────────────────────

/** ID del task de Trigger.dev que drena la cola. */
export const SCAN_QUEUE_TASK_ID = "drain-scan-queue-task";

export interface EnqueueScanJobInput extends EnqueueScanInput {
  /**
   * Plan explícito. Si se omite, el productor lo resuelve con el
   * policy-enforcer (`resolveProjectPlan`) para que el cupo de concurrencia
   * por plan del job sea el real del proyecto.
   */
  plan?: string;
  /**
   * Investigación a la que pertenece el escaneo. `scan_queue` no tiene columna
   * propia, así que el productor la sella dentro del `input` jsonb; el worker la
   * recupera de ahí para persistir findings y eventos de outbox en el timeline.
   */
  investigationId?: string | null;
}

export interface ScanQueueProducerDeps {
  exec: SqlExec;
  /** Resolución del plan del proyecto; inyectable para poder testear. */
  resolvePlan: (projectId: string) => Promise<string>;
}

export interface ScanQueueProducer {
  enqueueJob(input: EnqueueScanJobInput): Promise<{ id: string; plan: string }>;
  stats(): Promise<Array<{ status: string; plan: string; n: number }>>;
}

/**
 * Productor de la cola: estampa el `plan` del proyecto en el job antes de
 * encolarlo. El plan viene del **mismo** resolvedor que usa el
 * policy-enforcer, de modo que el cupo por plan (`scan_queue_slots` +
 * `PLAN_CONCURRENCY`) respeta los límites de la suscripción y no puede divergir
 * del gate de tools.
 */
export function createScanQueueProducer({ exec, resolvePlan }: ScanQueueProducerDeps): ScanQueueProducer {
  const queue = createPostgresScanQueue(exec);
  return {
    async enqueueJob(input) {
      const plan = input.plan ?? (await resolvePlan(input.projectId));

      // Contrapresión: la cola del proyecto se mide antes de insertar, de modo
      // que una request que ya no cabe falla rápido y con un motivo accionable
      // en vez de encolar un job condenado a esperar horas.
      const depth = await countActiveScanJobs(exec, input.projectId);
      const limit = queueLimitForPlan(plan);
      if (depth >= limit) {
        throw new QueueFullError(input.projectId, depth, limit);
      }

      const jobInput: Record<string, unknown> = {
        ...(input.input ?? {}),
        ...(input.investigationId ? { investigationId: input.investigationId } : {}),
      };
      return queue.enqueue({ ...input, plan, input: jobInput });
    },
    stats: () => queue.stats(),
  };
}

let producer: ScanQueueProducer | null = null;

/**
 * Productor activo (singleton por proceso). El resolvedor de plan se importa
 * dinámicamente para no cargar `@/shared/db`/el enforcer en contextos que solo
 * necesitan las primitivas de la cola (p. ej. los tests con PGlite).
 */
export function getScanQueueProducer(): ScanQueueProducer {
  producer ??= createScanQueueProducer({
    exec: directExec,
    resolvePlan: async (projectId) => {
      const { resolveProjectPlan } = await import("./core/policy-enforcer");
      return resolveProjectPlan(projectId);
    },
  });
  return producer;
}

/**
 * Encola un job estampando el plan del proyecto. Tolerante a fallos: si la BD o
 * el enforcer fallan, devuelve `null` y el llamante decide (p. ej. ejecutar en
 * línea).
 *
 * Única excepción: `QueueFullError` (contrapresión) se propaga, porque no es un
 * fallo de infraestructura sino un rechazo accionable que la ruta traduce a 429.
 */
export async function enqueueScanJob(input: EnqueueScanJobInput): Promise<{ id: string; plan: string } | null> {
  try {
    return await getScanQueueProducer().enqueueJob(input);
  } catch (error) {
    // Contrapresión: es una decisión de negocio (429 accionable), no un fallo de
    // infraestructura, así que se propaga en vez de degradar al camino síncrono
    // (que es justo lo que significa devolver `null`).
    if (error instanceof QueueFullError) throw error;
    logger.error("[scan-queue] enqueue del productor falló:", error);
    return null;
  }
}

/**
 * Purga los jobs terminados que superan la retención y devuelve cuántos borró.
 *
 * Idempotente y sin efecto cuando no hay nada que purgar (`rowCount = 0`). A
 * diferencia de `enqueueScanJob`, NO se traga los errores: si la BD no responde,
 * el task de Trigger.dev debe fallar y reintentarse (no perder la purga en
 * silencio).
 */
export async function purgeCompletedScanJobs(
  retentionDays = SCAN_QUEUE_RETENTION_DAYS
): Promise<number> {
  return getScanQueue().purgeCompleted(retentionDays);
}

/**
 * Despierta al drenador de la cola tras encolar (optimización de latencia).
 * El registro en `scan_queue` es la garantía durable: si este disparo se pierde,
 * el próximo reclamo (cron o cualquier otro encolado) toma el backlog. Nunca
 * lanza.
 */
export async function wakeScanQueueDrain(): Promise<void> {
  try {
    const { tasks } = await import("@trigger.dev/sdk");
    await tasks.trigger(SCAN_QUEUE_TASK_ID, {});
  } catch (error) {
    logger.warn("[scan-queue] no se pudo despertar al drenador:", error);
  }
}
