import { createHash } from "node:crypto";
import type { AIMessage, AITaskType } from "./ai-router";

/**
 * ai-cache.ts — Caché semántica IA (P1-3).
 *
 * Único nivel: Map en memoria por instancia (L1). El nivel L2 que vivía en
 * Upstash Redis desapareció con la eliminación de `@upstash/redis`: la
 * caché ya no sobrevive a un deploy ni se comparte entre instancias
 * serverless, de modo que una respuesta cacheada solo acelera repetición
 * dentro de la misma instancia caliente. Todo falla en silencio hacia
 * "miss": la caché nunca rompe una respuesta.
 *
 * Clave = sha256(taskType + scope + mensajes COMPLETOS). El scope lo aporta
 * el caller (ej. `seo-report:{projectId}:{yyyy-mm-dd}`) para que regenerar
 * lo mismo dentro del TTL sea hit seguro.
 */

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
  memory.set(key, { content, modelId, expiresAt: Date.now() + ttlSec * 1000 });
}

/**
 * Invalida la caché por ámbito (Sprint 1, idea #16): cuando entra un scan
 * nuevo de un proyecto, el caller pasa su cacheScope para que los resúmenes
 * cacheados (p.ej. exec-brief de 24h) nunca sirvan datos stale.
 *
 * Borra la caché de la instancia. Retorna las claves eliminadas.
 * Falla en silencio: la invalidación nunca rompe al caller.
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
  return deleted;
}
