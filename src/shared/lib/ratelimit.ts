import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { logSecurityEvent } from "./audit-log";
import { logger } from "@/lib/logger";

// ═════════════════════════════════════════════════════════════════════════════
// Redis Client (lazy, proxied para evitar eager instantiation en build)
// ═════════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════════
// Email allowlist (bypass de rate limit para cuentas autorizadas)
// ═════════════════════════════════════════════════════════════════════════════

const EMAIL_ALLOWLIST = new Set([
  "palacios_juan@hotmail.com",
]);

/**
 * Devuelve true si el email está en la allowlist de cuentas que NO deben
 * quedar bloqueadas por el rate limiting del flujo de autenticación.
 * Extensible vía env var AUTH_EMAIL_ALLOWLIST (comma-separated).
 */
export function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (EMAIL_ALLOWLIST.has(normalized)) return true;

  const extra = (process.env.AUTH_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(normalized);
}

// ═════════════════════════════════════════════════════════════════════════════
// IP Extraction
// ═════════════════════════════════════════════════════════════════════════════

const IP_BLOCKLIST = new Set([
  "127.0.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0", "::", "localhost",
]);

/**
 * Extrae la IP real del cliente desde headers con prioridad de confianza.
 *
 * Orden de precedencia (del más confiable al menos confiable):
 * 1. x-vercel-forwarded-for — Seteado por Vercel. El cliente NO puede falsificarlo.
 * 2. x-real-ip — Seteado por proxies reversos (Nginx, Cloudflare, AWS ELB).
 *    Relativamente confiable si el proxy lo protege.
 * 3. x-forwarded-for — El header estándar. En Vercel/Cloudflare, el proxy
 *    AGREGA al valor existente, por lo que el primer valor PUEDE ser del
 *    atacante. Se usa como último recurso.
 * 4. Fallback hash de User-Agent + Accept-Language — Útil en entornos
 *    sin headers de IP (ej: tests, desarrollo local sin proxy).
 */
export function extractClientIp(request: Request | { headers: Headers }): string {
  // 1. Header Vercel (autoritativo, no falsificable por el cliente)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp && !IP_BLOCKLIST.has(vercelIp)) return vercelIp;

  // 2. x-real-ip (proxy confiable: Nginx, Cloudflare, AWS)
  const realIp = request.headers.get("x-real-ip");
  if (realIp && !IP_BLOCKLIST.has(realIp)) return realIp;

  // 3. x-forwarded-for (puede contener IP falsificada por el cliente como
  //    primer valor — usado solo cuando no hay headers más confiables)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip && !IP_BLOCKLIST.has(ip)) return ip;
  }

  // Fallback: hash simple de headers compatible con Edge Runtime (sin Buffer)
  const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 32);
  const acceptLang = (request.headers.get("accept-language") || "unknown").slice(0, 8);
  let hash = 0;
  const str = `${userAgent}${acceptLang}`;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `anon-${Math.abs(hash).toString(36).padStart(6, "0")}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Rate Limit Result type
// ═════════════════════════════════════════════════════════════════════════════

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter: number;
}

/**
 * Setea headers de rate limiting estándar (IETF) y legacy (X- prefixed)
 * en un objeto Headers para mantener compatibilidad con clientes antiguos.
 */
function setRateLimitHeaders(headers: Headers, result: RateLimitResult): void {
  // Headers estándar IETF (RFC 6648 recomienda no usar X- prefix)
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(result.reset));

  // Headers legacy con X- prefix para compatibilidad descendente
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(result.reset));

  if (!result.success) {
    headers.set("Retry-After", String(result.retryAfter));
  }
}

/**
 * Construye headers HTTP estándar de rate limiting.
 */
export function buildRateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  setRateLimitHeaders(headers, result);
  return headers;
}

/**
 * Crea una respuesta 429 (Too Many Requests) con headers estándar.
 */
export function rateLimitResponse(result: RateLimitResult, extraBody: Record<string, unknown> = {}): NextResponse {
  const headers: Record<string, string> = {
    "Retry-After": String(result.retryAfter),
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.reset),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  return NextResponse.json(
    {
      error: `Demasiadas solicitudes. Intenta de nuevo en ${result.retryAfter} segundos.`,
      retryAfter: result.retryAfter,
      ...extraBody,
    },
    {
      status: 429,
      headers,
    }
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Generic Rate Limiter (cached per prefix)
// ═════════════════════════════════════════════════════════════════════════════

const _rateLimiterCache = new Map<string, Ratelimit>();

export interface RateLimitConfig {
  /** Máximo de requests permitidos en la ventana */
  limit: number;
  /** Ventana de tiempo en segundos */
  window: number;
  /** Prefijo único para el limiter en Redis (ej: "validate_email") */
  prefix: string;
  /** Opcional: función para extraer el identificador (default: extractClientIp) */
  identifier?: (req: Request) => string;
  /**
   * Opcional: autenticación async antes del rate limiting.
   * Si se provee, el rate limit identifica por user.id en lugar de IP.
   * Retorna null → 401 Unauthorized.
   */
  authenticate?: (req: Request) => Promise<{ id: string } | null>;
}

/**
 * Cachea y retorna una instancia de Ratelimit para un prefix dado.
 */
function getOrCreateLimiter(config: RateLimitConfig): Ratelimit {
  const key = config.prefix;
  let instance = _rateLimiterCache.get(key);
  if (!instance) {
    instance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.window} s`),
      analytics: true,
      prefix: `strat_audit_${config.prefix}`,
    });
    _rateLimiterCache.set(key, instance);
  }
  return instance;
}

// ═════════════════════════════════════════════════════════════════════════════
// In-Memory Fallback (sliding window por instancia)
//
// Cuando Redis está caído (o no configurado) la app NO debe quedar bloqueada:
// un outage de Upstash no puede convertir todos los endpoints rate-limited
// en 429 masivos. Este fallback mantiene un sliding window en memoria por
// instancia serverless. Tradeoff aceptado: el límite es por instancia, no
// global (Vercel puede tener N instancias calientes), pero garantiza
// disponibilidad y una protección razonable contra abuso básico.
// ═════════════════════════════════════════════════════════════════════════════

const memoryWindows = new Map<string, number[]>();

function checkRateLimitInMemory(identifier: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.window * 1000;
  const key = `${config.prefix}:${identifier}`;

  let timestamps = memoryWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    memoryWindows.set(key, timestamps);
  }

  // Podar timestamps fuera de la ventana
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0]! <= cutoff) {
    timestamps.shift();
  }

  // Acotar crecimiento del Map: barrido periódico cuando crece demasiado
  // (no borrar por llamada — eso perdería la ventana del identificador)
  if (memoryWindows.size > 10_000) {
    for (const [k, v] of memoryWindows) {
      if (v.length === 0) memoryWindows.delete(k);
    }
    // Re-vincular la clave actual si el sweep la dejó huérfana
    if (!memoryWindows.has(key)) memoryWindows.set(key, timestamps);
  }

  if (timestamps.length >= config.limit) {
    const reset = timestamps[0]! + windowMs;
    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      reset,
      retryAfter: Math.max(1, Math.ceil((reset - now) / 1000)),
    };
  }

  timestamps.push(now);
  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - timestamps.length,
    reset: now + windowMs,
    retryAfter: 0,
  };
}

/**
 * Verifica rate limit para un identificador con la configuración dada.
 *
 * Estrategia de resiliencia (fail-open degradado, nunca fail-closed):
 * 1. Redis configurado y sano → limiter distribuido de Upstash.
 * 2. Redis configurado pero caído (timeout/error) → fallback en memoria.
 * 3. Redis no configurado → fallback en memoria (igual en prod y dev).
 *
 * La disponibilidad de la app nunca depende de la salud de Redis.
 */
async function checkRateLimitInternal(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    logger.warn(`[RateLimit] UPSTASH_REDIS_REST_URL no configurado. Usando fallback en memoria para ${config.prefix}.`);
    return checkRateLimitInMemory(identifier, config);
  }

  try {
    const limiter = getOrCreateLimiter(config);
    // Timeout corto: si Redis no responde, degradar rápido al fallback en
    // memoria en vez de colgar el request (los 5.8s vistos en prod eran los
    // reintentos del SDK contra un host eliminado).
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        limiter.limit(identifier),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Redis rate limit timeout")), 3000);
        }),
      ]);
      const retryAfter = result.reset ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) : 60;
      return { ...result, retryAfter };
    } finally {
      // Evitar timers colgados cuando Redis responde rápido (mantiene la
      // instancia viva innecesariamente y rompe los open-handle checks)
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch (err) {
    // Redis unreachable — degradación graciosa, nunca 429 masivos
    logger.error(`[RateLimit] Redis unreachable for ${config.prefix}. Usando fallback en memoria.`, err);
    return checkRateLimitInMemory(identifier, config);
  }
}

/**
 * withRateLimit — Middleware/decorador genérico para envolver cualquier route handler
 * con rate limiting configurable.
 *
 * El handler recibe como segundo argumento el identificador usado para rate limit
 * (IP o user.id cuando se usa `authenticate`).
 *
 * Ejemplo (IP-based, sin autenticación):
 *
 *   export const POST = withRateLimit(
 *     { limit: 40, window: 60, prefix: "email_limit" },
 *     async (req, _identifier) => {
 *       return NextResponse.json({ success: true });
 *     }
 *   );
 *
 * Ejemplo (user-based, con autenticación):
 *
 *   export const POST = withRateLimit(
 *     {
 *       limit: 5, window: 60, prefix: "ai_copilot",
 *       authenticate: async (req) => {
 *         const supabase = await createClient();
 *         const { data: { user } } = await supabase.auth.getUser();
 *         return user ? { id: user.id } : null;
 *       }
 *     },
 *     async (req, userId) => {
 *       // userId === user.id del usuario autenticado
 *       return NextResponse.json({ success: true });
 *     }
 *   );
 */
export function withRateLimit<T extends Request = Request>(
  config: RateLimitConfig,
  handler: (req: T, identifier: string, ...args: unknown[]) => Promise<Response>
): (req: T, ...args: unknown[]) => Promise<Response> {
  return async (req: T, ...args: unknown[]): Promise<Response> => {
    try {
      let identifier: string;
      // Extraer IP siempre (antes de auth para rate_limit_hit log)
      const requestIp = extractClientIp(req);

      // Autenticación opcional antes del rate limiting
      if (config.authenticate) {
        const user = await config.authenticate(req);
        if (!user) {
          return NextResponse.json(
            { success: false, error: "No autorizado" },
            { status: 401 }
          );
        }
        identifier = user.id;
      } else {
        identifier = config.identifier?.(req) ?? requestIp;
      }

      const result = await checkRateLimitInternal(identifier, config);

      if (!result.success) {
        // Auditar evento de rate limit excedido (siempre incluye IP y userId)
        logSecurityEvent("rate_limit_hit", {
          ip: requestIp,
          userId: config.authenticate ? identifier : undefined,
          path: req.url || "/",
          method: req.method || "UNKNOWN",
          userAgent: req.headers?.get("user-agent") || undefined,
          metadata: {
            prefix: config.prefix,
            limit: config.limit,
            window: config.window,
            remaining: result.remaining,
            reset: result.reset,
            retryAfter: result.retryAfter,
          },
        });
        return rateLimitResponse(result);
      }

      const response = await handler(req, identifier, ...args);

      // Adjuntar headers de rate limit a la respuesta (estándar + legacy)
      const newHeaders = new Headers(response.headers);
      newHeaders.set("RateLimit-Limit", String(result.limit));
      newHeaders.set("RateLimit-Remaining", String(result.remaining));
      newHeaders.set("RateLimit-Reset", String(result.reset));
      newHeaders.set("X-RateLimit-Limit", String(result.limit));
      newHeaders.set("X-RateLimit-Remaining", String(result.remaining));
      newHeaders.set("X-RateLimit-Reset", String(result.reset));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      logger.error(`[withRateLimit:${config.prefix}] Error:`, error);
      return NextResponse.json(
        { error: "Error interno del servidor" },
        { status: 500 }
      );
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Rate Limiters específicos (legacy, mantienen compatibilidad)
// ═════════════════════════════════════════════════════════════════════════════

// ─── AI Copilot (5 req / 60s) ────────────────────────────────────────

export async function checkAiRateLimit(userId: string) {
  return checkRateLimitInternal(userId, { limit: 5, window: 60, prefix: "ai_limit" });
}

// ─── Email Validation (40 req / 60s por IP) ─────────────────────────
// Límite alto porque el login valida en tiempo real (debounce 400ms) al tipear.

export async function checkEmailRateLimit(ip: string) {
  return checkRateLimitInternal(ip, { limit: 40, window: 60, prefix: "email_limit" });
}

// ─── Auth Callback (10 req / 60s por IP) ────────────────────────────

export async function checkCallbackRateLimit(ip: string) {
  return checkRateLimitInternal(ip, { limit: 10, window: 60, prefix: "callback_limit" });
}

// ─── Intelligence Scan (30 req / 60s por usuario) ─────────────────
// Los escaneos de infraestructura ejecutan 21 herramientas en paralelo
// y NO consumen modelos de IA/LLM. El límite es más alto que AI Copilot
// porque el usuario necesita escanear múltiples objetivos.

export async function checkIntelScanRateLimit(userId: string) {
  return checkRateLimitInternal(userId, { limit: 30, window: 60, prefix: "intel_scan" });
}
