import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import type { AIMessage, AITaskType } from "./ai-router";
import {
  cacheGet,
  cacheSet,
  cacheDeleteByPrefix,
  isDistributedCacheEnabled,
} from "@/shared/lib/distributed-cache";

/**
 * ai-cache.ts — Caché semántica IA (P1-3) con L2 distribuido (6.2).
 *
 * L1: Map en memoria por instancia. Primer lookup, latencia 0; no sobrevive
 * a un deploy ni se comparte entre instancias serverless.
 *
 * L2: tabla `distributed_cache` en Postgres vía `distributed-cache.ts`
 * (ADR-008 C2, enmendado). Fail-open SIEMPRE: un fallo del L2 se trata
 * como miss; la caché nunca rompe una respuesta.
 *
 * Clave = sha256(taskType + scope + mensajes COMPLETOS). El scope lo aporta
 * el caller (ej. `seo-report:{projectId}:{yyyy-mm-dd}`) para que regenerar
 * lo mismo dentro del TTL sea hit seguro.
 */

/** C2 (review): el L2 jamás sirve respuestas de más de 1 h — cap sobre ttlFor(). */
const L2_MAX_TTL_MS = 3_600_000;

const TTL_BY_TASK: Record<AITaskType, number> = {
  "seo-report": 24 * 3600,
  "incident-brief": 3600,
  "copilot-remediation": 3600,
  "general-chat": 3600,
  "adversary-analysis": 3600,
  "anomaly-narrative": 3600,
  // El triage es determinista por evidencia: si la evidencia no cambia,
  // la respuesta tampoco. 6h equilibra frescura y llamadas.
  "finding-triage": 6 * 3600,
  // Resumen ejecutivo: invariante mientras no cambie la auditoría de origen
  // (el scope incluye su fecha), pero se pide tras cada fallo de trigger →
  // ventana generosa de 24h.
  "exec-brief": 24 * 3600,
  // Narración de alertas: el evento que narra es efímero (timestamp dentro
  // de los mensajes) → cada alerta es única de facto; TTL bajo solo anti-
  // reintentos duplicados del dispatcher.
  "narrated-alert": 5 * 60,
};

export interface CacheHit {
  content: string;
  modelId: string;
}

const memory = new Map<string, { content: string; modelId: string; expiresAt: number }>();

export function buildSemanticKey(
  taskType: AITaskType,
  scope: string,
  messages: AIMessage[]
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(messages))
    .digest("hex")
    .slice(0, 32);
  return `ai:${taskType}:${scope || "global"}:${hash}`;
}

export function ttlFor(taskType: AITaskType): number {
  return TTL_BY_TASK[taskType] ?? 3600;
}

/**
 * C1 (review owner): determina si una key lleva tenant en el scope.
 * Formato: `ai:<taskType>:<scope>:<hash>` — el hash (hex, sin ":") es el
 * último segmento, así que el scope es TODO lo intermedio (puede tener ":").
 * `scope === "global"` (callers sin cacheScope) → NO es tenant-scoped.
 */
function isTenantScopedKey(key: string): boolean {
  const parts = key.split(":");
  if (parts.length < 4) return false;
  const scope = parts.slice(2, parts.length - 1).join(":");
  return scope !== "global";
}

/**
 * Métricas de hit-rate (Sprint 1, idea #16). Contador en memoria por
 * instancia; el dashboard /ai/health muestra el ratio agregado. Los contadores
 * viven por proceso (serverless: vida corta) — orientativos, no facturables.
 */
const metrics = { hits: 0, misses: 0 };

export function cacheMetrics(): { hits: number; misses: number; hitRate: number | null } {
  const total = metrics.hits + metrics.misses;
  return {
    hits: metrics.hits,
    misses: metrics.misses,
    hitRate: total === 0 ? null : metrics.hits / total,
  };
}

/** Reset de contadores (tests / ventanas de medición). */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

export async function getSemanticCache(key: string): Promise<CacheHit | null> {
  const hit = await lookupSemanticCache(key);
  if (hit) metrics.hits++;
  else metrics.misses++;
  return hit;
}

async function lookupSemanticCache(key: string): Promise<CacheHit | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    return { content: mem.content, modelId: mem.modelId };
  }
  if (mem) memory.delete(key);
  // L2 distribuido (ADR-008 C2): fail-open SIEMPRE. El wrapper cacheGet ya
  // devuelve undefined ante error, pero el conector no delega su contrato de
  // "la caché nunca rompe una respuesta" al almacén: cualquier fallo del L2
  // se trata como miss aquí también (desviación D1 documentada en la tarea).
  if (isDistributedCacheEnabled()) {
    try {
      const l2 = await cacheGet<CacheHit & { expiresAt: number }>(key);
      if (l2 && l2.expiresAt > now) {
        return { content: l2.content, modelId: l2.modelId };
      }
    } catch (error) {
      logger.warn(`[ai-cache] lookup L2 falló (fail-open) para "${key}":`, error);
      return null;
    }
  }
  return null;
}

export async function setSemanticCache(
  key: string,
  content: string,
  modelId: string,
  taskType: AITaskType
): Promise<void> {
  const ttlSec = ttlFor(taskType);
  if (memory.size > 500) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  const expiresAt = Date.now() + ttlSec * 1000;
  memory.set(key, { content, modelId, expiresAt });
  // Guard C1 (review owner 2026-10-20): la persistencia cross-instancia del
  // L2 amplifica el colisión que en L1 era transitoria. Una key SIN tenant en
  // el scope ("ai:<type>:global:<hash>") puede corresponder a cualquier
  // tenant con la misma secuencia de mensajes → su respuesta NUNCA se
  // escribe al L2. Los 4 taskTypes sin cacheScope (copilot/brief/etc.) quedan
  // en L1 como hasta ahora; su migración a scope por-tenant es follow-up.
  if (isDistributedCacheEnabled() && isTenantScopedKey(key)) {
    // Fail-open (D1): el wrapper cacheSet ya es fail-open; el conector se
    // protege también aquí para que un L2 caído no rompa al caller.
    try {
      await cacheSet(
        key,
        { content, modelId, expiresAt },
        Math.min(ttlSec * 1000, L2_MAX_TTL_MS)
      );
    } catch (error) {
      logger.warn(`[ai-cache] set L2 falló (fail-open) para "${key}":`, error);
    }
  }
}

/**
 * Invalida la caché por ámbito (Sprint 1, idea #16): cuando entra un scan
 * nuevo de un proyecto, el caller pasa su cacheScope para que los resúmenes
 * cacheados (p.ej. exec-brief de 24h) nunca sirvan datos stale.
 *
 * Borra la caché de la instancia Y del L2 distribuido. Retorna las claves
 * eliminadas. Falla en silencio: la invalidación nunca rompe al caller.
 */
export async function invalidateCacheScope(taskType: AITaskType, scope: string): Promise<number> {
  const prefix = `ai:${taskType}:${scope}`;
  let deleted = 0;
  for (const key of Array.from(memory.keys())) {
    if (key.startsWith(prefix)) {
      memory.delete(key);
      deleted++;
    }
  }
  // Invalidación on-write en el L2 (fail-open del wrapper). El caller
  // (audit.trigger.ts: invalidateCacheScope en cada scan nuevo) ya la dispara.
  const l2Deleted = await cacheDeleteByPrefix(prefix);
  return deleted + l2Deleted;
}
