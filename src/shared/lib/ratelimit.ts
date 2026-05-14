import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Configuración del cliente de Redis para Upstash.
// Las variables de entorno UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN
// deben estar configuradas en .env.local
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

/**
 * Crea un limitador de peticiones.
 * Configuración por defecto: 5 peticiones cada 60 segundos (ventana deslizante).
 */
export const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: true,
  prefix: "strat_audit_ai_limit",
});

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

  return await aiRateLimit.limit(userId);
}
