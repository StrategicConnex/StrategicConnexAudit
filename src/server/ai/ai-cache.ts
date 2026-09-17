import { createHash } from "node:crypto";
import type { AIMessage, AITaskType } from "./ai-router";

/**
 * ai-cache.ts — Caché semántica IA en 2 niveles (P1-3).
 *
 * L1: Map en memoria (rápido, por instancia). L2: Upstash Redis compartido
 * (sobrevive a serverless y a deploys). Sin Redis configurado solo opera L1.
 * Todo falla en silencio hacia "miss": la caché nunca rompe una respuesta.
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
};

export interface CacheHit {
  content: string;
  modelId: string;
}

const memory = new Map<string, { content: string; modelId: string; expiresAt: number }>();

type RedisLike = {
  get: (key: string) => Promise<string | object | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<unknown>;
};

let redisClient: RedisLike | null | undefined;
function getRedis(): RedisLike | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  try {
    // Import perezoso: no arrastrar el SDK si no hay credenciales.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
    redisClient = new Redis({ url, token }) as RedisLike;
  } catch {
    redisClient = null;
  }
  return redisClient;
}

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

export async function getSemanticCache(key: string): Promise<CacheHit | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    return { content: mem.content, modelId: mem.modelId };
  }
  if (mem) memory.delete(key);
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as CacheHit;
    if (!parsed?.content) return null;
    return { content: parsed.content, modelId: parsed.modelId };
  } catch {
    return null;
  }
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
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify({ content, modelId }), { ex: ttlSec });
  } catch {
    // Miss silencioso en escritura: L1 sigue sirviendo.
  }
}
