/**
 * rate-limiter.ts — Rate Limiting por IP y dominio objetivo.
 *
 * Implementación in-memory de sliding window rate limiting para la capa
 * de API de inteligencia. Protege contra:
 *   - Abuso de escaneos masivos desde una misma IP
 *   - Escaneos repetitivos contra el mismo dominio objetivo
 *   - Agotamiento de cuotas de APIs externas (GeoIP, WHOIS, etc.)
 *
 * Compatible con Vercel Serverless (in-memory por instancia) y puede
 * escalarse a Redis cuando se necesite consistencia cross-instancia.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;       // Unix timestamp (ms) cuando se reinicia la ventana
  retryAfterMs: number;  // Milisegundos hasta que se pueda reintentar
}

interface WindowEntry {
  timestamps: number[];
  blockedUntil?: number;
}

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly blockOnExcessMs: number;

  constructor(options: {
    /** Máximo de requests permitidos en la ventana */
    maxRequests: number;
    /** Tamaño de la ventana en milisegundos */
    windowMs: number;
    /** Duración del bloqueo temporal al superar el límite (default: 1 min) */
    blockOnExcessMs?: number;
  }) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.blockOnExcessMs = options.blockOnExcessMs ?? 60_000;
  }

  /**
   * Evalúa si una clave (IP, dominio, userId) puede proceder.
   * Registra el intento internamente.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let entry = this.windows.get(key);

    // Si la clave está bloqueada, rechazar inmediatamente
    if (entry?.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfterMs: entry.blockedUntil - now,
      };
    }

    // Inicializar o limpiar timestamps fuera de la ventana
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    } else {
      entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
      entry.blockedUntil = undefined;
    }

    // Evaluar si se excede el límite
    if (entry.timestamps.length >= this.maxRequests) {
      // Activar bloqueo temporal
      entry.blockedUntil = now + this.blockOnExcessMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfterMs: this.blockOnExcessMs,
      };
    }

    // Registrar el request actual
    entry.timestamps.push(now);

    const remaining = this.maxRequests - entry.timestamps.length;
    const oldestTs = entry.timestamps[0] ?? now;
    const resetAt = oldestTs + this.windowMs;

    return {
      allowed: true,
      remaining,
      resetAt,
      retryAfterMs: 0,
    };
  }

  /**
   * Verifica sin registrar el intento (modo consulta).
   */
  peek(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entry = this.windows.get(key);

    if (!entry) {
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: now + this.windowMs,
        retryAfterMs: 0,
      };
    }

    if (entry.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfterMs: entry.blockedUntil - now,
      };
    }

    const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
    const remaining = Math.max(0, this.maxRequests - validTimestamps.length);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt: (validTimestamps[0] ?? now) + this.windowMs,
      retryAfterMs: remaining > 0 ? 0 : this.blockOnExcessMs,
    };
  }

  /**
   * Resetea el límite de una clave específica (útil en tests o recuperación manual).
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Purga entradas de ventanas expiradas para liberar memoria.
   */
  purgeExpired(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let purged = 0;

    for (const [key, entry] of this.windows.entries()) {
      const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
      const isBlocked = entry.blockedUntil && entry.blockedUntil > now;

      if (validTimestamps.length === 0 && !isBlocked) {
        this.windows.delete(key);
        purged++;
      } else {
        entry.timestamps = validTimestamps;
      }
    }

    return purged;
  }

  get size(): number {
    return this.windows.size;
  }
}

// ─── Instancias pre-configuradas para la plataforma ──────────────────────────

/**
 * Rate limiter por IP del cliente.
 * 30 análisis por IP en ventana de 10 minutos.
 * Block de 5 minutos en caso de exceso.
 */
export const ipRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 30,
  windowMs: 10 * 60 * 1000,
  blockOnExcessMs: 5 * 60 * 1000,
});

/**
 * Rate limiter por dominio objetivo.
 * 10 análisis del mismo dominio en ventana de 5 minutos.
 * Evita el bombardeo de escaneos contra un único objetivo.
 */
export const domainRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 10,
  windowMs: 5 * 60 * 1000,
  blockOnExcessMs: 2 * 60 * 1000,
});

/**
 * Rate limiter por userId para análisis masivos.
 * 50 operaciones de herramientas individuales por usuario en ventana de 1 minuto.
 */
export const userRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 50,
  windowMs: 60 * 1000,
  blockOnExcessMs: 30 * 1000,
});

/**
 * Rate limiter global de APIs externas (GeoIP, WHOIS).
 * Protege cuotas de terceros: máx. 100 requests/min globales.
 */
export const externalApiRateLimiter = new SlidingWindowRateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000,
  blockOnExcessMs: 10 * 1000,
});
