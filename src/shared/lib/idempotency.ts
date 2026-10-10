/**
 * idempotency.ts — Idempotencia de endpoints mutadores (A6)
 *
 * Un cliente que reintenta un POST (timeout, red, doble clic) no debe crear
 * dos veces el mismo recurso. El cliente envía `Idempotency-Key`; el servidor
 * reclama la clave de forma atómica con `INSERT … ON CONFLICT DO NOTHING`:
 *
 *   - primera vez  → ejecuta el handler y guarda la respuesta;
 *   - reintento    → devuelve la respuesta guardada (replay) sin re-ejecutar;
 *   - en curso     → 409 + Retry-After (otra request con la misma clave corre);
 *   - otro cuerpo  → 409 (misma clave con payload distinto = error del cliente).
 *
 * La tabla `idempotency_keys` es accesible solo por el backend (`directDb`,
 * RLS fail-closed). Si el store no responde, el helper **falla abierto**: deja
 * pasar la petición sin garantía en vez de romper el endpoint — igual que la
 * caché distribuida, la idempotencia es una mejora, no una barrera.
 *
 * Fail-open también en los 5xx: NO se guarda una respuesta de error de
 * servidor como definitiva, para que un reintento pueda completar el trabajo.
 */

import { sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { logger } from "@/lib/logger";

/** Cabecera estándar de idempotencia. */
export const IDEMPOTENCY_HEADER = "idempotency-key";
/** Ventana de retención de una clave (24 h). */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Cota defensiva del valor de la cabecera. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/** Ejecutor de SQL ligado al backend activo (patrón `scan-queue`). */
export type SqlExec = (query: SQL) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

export interface IdempotencyRow {
  id: string;
  status: string;
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

export interface BeginInput {
  scopeKey: string;
  userId: string;
  endpoint: string;
  requestHash: string;
  ttlMs: number;
}

export type BeginResult =
  | { acquired: true; id: string }
  | { acquired: false; row: IdempotencyRow };

export interface IdempotencyStore {
  begin(input: BeginInput): Promise<BeginResult>;
  storeResponse(id: string, status: number, body: unknown): Promise<void>;
  release(id: string): Promise<void>;
  purgeExpired(): Promise<number>;
}

/** SHA-256 del cuerpo serializado: detecta reutilización de clave con otro payload. */
export function hashRequestBody(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function createPostgresIdempotencyStore(exec: SqlExec): IdempotencyStore {
  return {
    async begin({ scopeKey, userId, endpoint, requestHash, ttlMs }: BeginInput): Promise<BeginResult> {
      const expiresAt = new Date(Date.now() + ttlMs);
      const inserted = await exec(sql`
        INSERT INTO idempotency_keys (scope_key, user_id, endpoint, request_hash, expires_at)
        VALUES (${scopeKey}, ${userId}, ${endpoint}, ${requestHash}, ${expiresAt})
        ON CONFLICT (endpoint, user_id, scope_key) DO NOTHING
        RETURNING id
      `);
      const acquired = inserted.rows[0] as { id: string } | undefined;
      if (acquired) return { acquired: true, id: acquired.id };

      const existing = await exec(sql`
        SELECT id, status, request_hash, response_status, response_body
        FROM idempotency_keys
        WHERE endpoint = ${endpoint} AND user_id = ${userId} AND scope_key = ${scopeKey}
        LIMIT 1
      `);
      return { acquired: false, row: existing.rows[0] as IdempotencyRow };
    },

    async storeResponse(id: string, status: number, body: unknown): Promise<void> {
      await exec(sql`
        UPDATE idempotency_keys
        SET status = 'completed',
            response_status = ${status},
            response_body = ${body === undefined ? null : JSON.stringify(body)}::jsonb,
            completed_at = now()
        WHERE id = ${id}
      `);
    },

    async release(id: string): Promise<void> {
      await exec(sql`DELETE FROM idempotency_keys WHERE id = ${id} AND status = 'in_progress'`);
    },

    async purgeExpired(): Promise<number> {
      const res = await exec(sql`DELETE FROM idempotency_keys WHERE expires_at < now()`);
      return res.rowCount ?? 0;
    },
  };
}

async function directExec(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> {
  const { directDb } = await import("@/shared/db");
  return (await directDb.execute(query)) as unknown as { rows: unknown[]; rowCount?: number | null };
}

let store: IdempotencyStore | null = null;

function getStore(): IdempotencyStore {
  store ??= createPostgresIdempotencyStore(directExec);
  return store;
}

/** Libera una clave reclamada sin marcarla completada (fallo del handler). */
async function safeRelease(id: string): Promise<void> {
  try {
    await getStore().release(id);
  } catch (error) {
    logger.warn("[idempotency] no se pudo liberar la clave:", error);
  }
}

/** Guarda la respuesta si es un resultado final digno de replay (no 5xx). */
async function finalize(id: string, response: NextResponse): Promise<void> {
  if (response.status >= 500) {
    await safeRelease(id);
    return;
  }
  try {
    const body = await response.clone().json().catch(() => null);
    await getStore().storeResponse(id, response.status, body);
  } catch (error) {
    logger.warn("[idempotency] no se pudo guardar la respuesta:", error);
  }
}

export interface IdempotencyMeta {
  userId: string;
  endpoint: string;
  ttlMs?: number;
}

/**
 * Envuelve un handler mutador. Sin `Idempotency-Key` se comporta como el
 * handler original; con la cabecera aplica la política de idempotencia.
 */
export async function withIdempotency(
  req: Request,
  meta: IdempotencyMeta,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const rawKey = req.headers.get(IDEMPOTENCY_HEADER);
  if (!rawKey) return handler();

  const scopeKey = rawKey.trim();
  if (!scopeKey || scopeKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return NextResponse.json(
      { success: false, error: "Idempotency-Key inválida" },
      { status: 400 },
    );
  }

  let requestHash = "";
  try {
    requestHash = hashRequestBody(await req.clone().text());
  } catch {
    requestHash = "";
  }

  let begun: BeginResult;
  try {
    begun = await getStore().begin({
      scopeKey,
      userId: meta.userId,
      endpoint: meta.endpoint,
      requestHash,
      ttlMs: meta.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS,
    });
  } catch (error) {
    logger.warn("[idempotency] store no disponible — se ejecuta sin garantía:", error);
    return handler();
  }

  if (begun.acquired) {
    try {
      const response = await handler();
      await finalize(begun.id, response);
      return response;
    } catch (error) {
      await safeRelease(begun.id);
      throw error;
    }
  }

  const row = begun.row;
  if (row.request_hash && requestHash && row.request_hash !== requestHash) {
    return NextResponse.json(
      { success: false, error: "Idempotency-Key ya usada con otro cuerpo" },
      { status: 409 },
    );
  }

  if (row.status === "completed" && row.response_body != null) {
    return NextResponse.json(row.response_body, {
      status: row.response_status ?? 200,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  return NextResponse.json(
    { success: false, error: "Petición idéntica en curso — reintenta en unos segundos" },
    { status: 409, headers: { "Retry-After": "1" } },
  );
}
