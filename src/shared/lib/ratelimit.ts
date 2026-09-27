import { NextResponse } from "next/server";
import { logSecurityEvent } from "./audit-log";
import { logger, runWithRequestContext } from "@/lib/logger";
import { readRequestId } from "@/lib/request-context";

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
// Rate Limit Config
// ═════════════════════════════════════════════════════════════════════════════

export interface RateLimitConfig {
  /** Máximo de requests permitidos en la ventana */
  limit: number;
  /** Ventana de tiempo en segundos */
  window: number;
  /** Prefijo único del limiter en memoria (ej: "validate_email") */
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
 * Rate limiting con sliding window en memoria por instancia.
 *
 * Tras eliminar `@upstash/ratelimit`/`@upstash/redis` esta es la ÚNICA
 * estrategia: nunca hay red, nunca puede haber fail-closed masivo por un
 * outage externo, y el coste por request es O(1) de CPU. Tradeoff aceptado
 * (ADR-002): el límite es por instancia serverless, no global — en Vercel
 * pueden existir N instancias calientes. Para abuso distribuido la defensa
 * son el WAF/edge y las cuotas diarias por usuario.
 * ═════════════════════════════════════════════════════════════════════════════
 */

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
 * Sliding window en memoria por instancia: sin I/O de red y sin servicio
 * externo del que degradar, por lo que jamás puede convertirse en un
 * fail-closed masivo. El alcance es por instancia serverless (ADR-002).
 */
async function checkRateLimitInternal(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  return checkRateLimitInMemory(identifier, config);
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
  // G1 — Correlation IDs: la guarda completa (auth, chequeo, handler y
  // catch) corre dentro del scope del `x-request-id`, de modo que los logs
  // de `rate_limit_hit` y los del handler comparten correlation id.
  return (req: T, ...args: unknown[]): Promise<Response> =>
    runWithRequestContext(
      { requestId: readRequestId(req) },
      () => runRateLimited(config, handler, req, args)
    );
}

async function runRateLimited<T extends Request>(
  config: RateLimitConfig,
  handler: (req: T, identifier: string, ...args: unknown[]) => Promise<Response>,
  req: T,
  args: unknown[]
): Promise<Response> {
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

    // G1 — Correlation IDs: el scope del handler añade `userId` para que
    // cualquier logger.* dentro del route handler lo incluya en la línea JSON.
    const response = await runWithRequestContext(
      {
        requestId: readRequestId(req),
        userId: config.authenticate ? identifier : undefined,
      },
      () => handler(req, identifier, ...args)
    );

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
}

// ═════════════════════════════════════════════════════════════════════════════
// Rate Limiters específicos (legacy, mantienen compatibilidad)
// ═════════════════════════════════════════════════════════════════════════════

// ─── AI Copilot (5 req / 60s) ────────────────────────────────────────

export async function checkAiRateLimit(userId: string) {
  return checkRateLimitInternal(userId, { limit: 5, window: 60, prefix: "ai_limit" });
}

// ─── Cuotas diarias IA por task (P0-1 anti-ruina) ─────────────────────
// Frecuencia ≠ volumen: los sliding-window por minuto no impiden que un
// loop agote el free-tier del proveedor para toda la plataforma. Estas
// cuotas diarias por usuario acotan el gasto total. Ventana 86400 s,
// contada en memoria por instancia (misma estrategia que los sliding-window).

export const AI_DAILY_QUOTAS = {
  "seo-report": 20,
  "general-chat": 100,
  "copilot-remediation": 100,
  "incident-brief": 50,
  "adversary-analysis": 10,
  "anomaly-narrative": 50,
  // El triage corre en background (Trigger.dev) y por batch: cuota generosa
  // pero acotada — el sweep diario usa userId null (sin cuota de usuario).
  "finding-triage": 60,
  // Post-audit (Trigger.dev): 1 brief por auditoría, techo anti-bucle.
  "exec-brief": 10,
  // Narración por alerta despachada (Trigger.dev/webhooks).
  "narrated-alert": 40,
} as const;

export type AiQuotaTask = keyof typeof AI_DAILY_QUOTAS;

export async function checkAiDailyQuota(userId: string, task: AiQuotaTask) {
  return checkRateLimitInternal(userId, {
    limit: AI_DAILY_QUOTAS[task],
    window: 86400,
    prefix: `ai_quota_${task}`,
  });
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
