/**
 * distributed-cache.ts — Caché distribuida L2 (C2) re-scopeada a Postgres.
 *
 * El escenario original de C2 decía Redis; el proyecto ya no usa Redis
 * (ADR-002 enmiendas 14–15). Esta caché vive en Postgres (`distributed_cache`)
 * con el mismo `DATABASE_URL`, sin servicios externos, y comparte el resultado
 * de una tool entre todas las instancias serverless via el `cache_key` que ya
 * usa `intelligence_tool_runs`.
 *
 * Dos stores intercambiables con la misma semántica:
 *   - `postgres` (producción): tabla compartida vía `directDb`.
 *   - `memory` (dev/test): Map por instancia, sin I/O.
 *
 * Fail-open SIEMPRE: un fallo del store se trata como miss (`get` → undefined,
 * `set` → no-op). La caché optimiza coste y latencia; nunca bloquea ni falsea
 * la ejecución de una herramienta.
 */

import { sql, type SQL } from "drizzle-orm";
import { logger } from "@/lib/logger";

/** Ejecutor de SQL ligado al backend activo. */
export type SqlExec = (query: SQL) => Promise<{ rows: unknown[]; rowCount?: number | null }>;

export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  /**
   * Elimina por prefijo (invalidación por scope, C2 del review).
   * Opcional: los callers la usan con fail-open.
   */
  deleteByPrefix?(prefix: string): Promise<number>;
}

/** TTL por defecto de una entrada (5 min, igual que el L1 en memoria). */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ── Store postgres ──────────────────────────────────────────────────────────

export function createPostgresCacheStore(exec: SqlExec): CacheStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const res = await exec(
        sql`SELECT value FROM distributed_cache WHERE key = ${key} AND expires_at > now()`,
      );
      const row = res.rows[0] as { value: unknown } | undefined;
      return row ? (row.value as T) : undefined;
    },

    async set(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): Promise<void> {
      if (value === undefined) return;
      await exec(sql`
        INSERT INTO distributed_cache (key, value, expires_at)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${new Date(Date.now() + ttlMs)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
      `);
    },

    async delete(key: string): Promise<void> {
      await exec(sql`DELETE FROM distributed_cache WHERE key = ${key}`);
    },

    async purgeExpired(): Promise<number> {
      const res = await exec(sql`DELETE FROM distributed_cache WHERE expires_at < now()`);
      return res.rowCount ?? 0;
    },

    async deleteByPrefix(prefix: string): Promise<number> {
      // LIKE-escape (follow-up del review T3): '%', '_' y '\' en el prefijo se
      // tratan como literales con el escape por defecto de LIKE en Postgres,
      // para que la invalidación por scope no borre de más (un prefijo con
      // "_" o "%" no debe actuar como wildcard).
      const escaped = prefix.replace(/[%_\\]/g, "\\$&");
      const res = await exec(
        sql`DELETE FROM distributed_cache WHERE key LIKE ${escaped + "%"}`,
      );
      return res.rowCount ?? 0;
    },
  };
}

// ── Store memoria ───────────────────────────────────────────────────────────

export function createMemoryCacheStore(): CacheStore {
  const map = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        map.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    async set(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): Promise<void> {
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async delete(key: string): Promise<void> {
      map.delete(key);
    },
    async purgeExpired(): Promise<number> {
      let purged = 0;
      for (const [k, entry] of map) {
        if (Date.now() > entry.expiresAt) {
          map.delete(k);
          purged++;
        }
      }
      return purged;
    },
    async deleteByPrefix(prefix: string): Promise<number> {
      let deleted = 0;
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) {
          map.delete(k);
          deleted++;
        }
      }
      return deleted;
    },
  };
}

// ── Selección de store ──────────────────────────────────────────────────────

/**
 * `CACHE_STORE=postgres|memory` fuerza la elección; sin override, `postgres`
 * sólo en producción y `memory` en dev/test (sin I/O en las suites).
 */
export function resolveCacheStore(): "postgres" | "memory" {
  const override = process.env.CACHE_STORE;
  if (override === "postgres" || override === "memory") return override;
  return process.env.NODE_ENV === "production" ? "postgres" : "memory";
}

/** El L2 distribuido sólo aporta valor (y sólo toca la BD) en modo postgres. */
export function isDistributedCacheEnabled(): boolean {
  return resolveCacheStore() === "postgres";
}

async function directExec(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> {
  const { directDb } = await import("@/shared/db");
  return (await directDb.execute(query)) as unknown as { rows: unknown[]; rowCount?: number | null };
}

let postgresStore: CacheStore | null = null;
let memoryStore: CacheStore | null = null;

/** Store activo según `resolveCacheStore()` (singleton por proceso). */
export function getCacheStore(): CacheStore {
  if (resolveCacheStore() === "postgres") {
    postgresStore ??= createPostgresCacheStore(directExec);
    return postgresStore;
  }
  memoryStore ??= createMemoryCacheStore();
  return memoryStore;
}

// ── API pública (fail-open) ─────────────────────────────────────────────────

/** Lee una entrada; ante cualquier error devuelve `undefined` (miss). */
export async function cacheGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    return await getCacheStore().get<T>(key);
  } catch (error) {
    logger.warn(`[distributed-cache] get falló (fail-open) para "${key}":`, error);
    return undefined;
  }
}

/** Escribe una entrada; ante cualquier error no hace nada (no rompe el flujo). */
export async function cacheSet(key: string, value: unknown, ttlMs?: number): Promise<void> {
  try {
    await getCacheStore().set(key, value, ttlMs);
  } catch (error) {
    logger.warn(`[distributed-cache] set falló (fail-open) para "${key}":`, error);
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await getCacheStore().delete(key);
  } catch (error) {
    logger.warn(`[distributed-cache] delete falló (fail-open) para "${key}":`, error);
  }
}

export async function cachePurgeExpired(): Promise<number> {
  try {
    return await getCacheStore().purgeExpired();
  } catch (error) {
    logger.warn("[distributed-cache] purgeExpired falló (fail-open):", error);
    return 0;
  }
}

/** Borra por prefijo; ante cualquier error devuelve 0 (invalidación nunca rompe). */
export async function cacheDeleteByPrefix(prefix: string): Promise<number> {
  try {
    const store = getCacheStore();
    return (await store.deleteByPrefix?.(prefix)) ?? 0;
  } catch (error) {
    logger.warn(`[distributed-cache] deleteByPrefix falló (fail-open) para "${prefix}":`, error);
    return 0;
  }
}
