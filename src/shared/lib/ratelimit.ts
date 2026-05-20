import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _redisInstance: Redis | null = null;

function getRedisInstance(): Redis {
  if (!_redisInstance) {
    _redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    });
  }
  return _redisInstance;
}

// Proxied redis client to prevent eager instantiation during build phase
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    const instance = getRedisInstance();
    const value = Reflect.get(instance, prop);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  }
});

let _aiRateLimitInstance: Ratelimit | null = null;

function getAiRateLimitInstance(): Ratelimit {
  if (!_aiRateLimitInstance) {
    _aiRateLimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
      prefix: "strat_audit_ai_limit",
    });
  }
  return _aiRateLimitInstance;
}

/**
 * Verifica si un usuario ha excedido el límite.
 * @param userId ID del usuario para aplicar el límite.
 * @returns Un objeto con { success, limit, remaining, reset }
 */
export async function checkAiRateLimit(userId: string) {
  // Si no hay URL de Redis configurada, permitimos la ejecución (fail-open)
  // para evitar bloquear la app si el servicio no está configurado.
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  return await getAiRateLimitInstance().limit(userId);
}

