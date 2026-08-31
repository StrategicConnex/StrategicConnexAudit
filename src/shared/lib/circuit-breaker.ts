import { redis } from './ratelimit';
import { logger } from "@/lib/logger";

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitConfig {
  failureThreshold: number;
  recoveryTimeout: number; // in milliseconds
  successThreshold: number;
}

/**
 * Timeout corto para operaciones de bookkeeping de Redis. Cuando Redis está
 * caído (p.ej. DB de Upstash eliminada), el SDK de @upstash/redis reintenta
 * contra el host muerto durante 5-15s POR operación. En el flujo del router
 * IA esto sumaba latencia crítica (504 de Vercel a los 120s) y —peor— podía
 * DESECHAR un resultado de modelo exitoso: si onSuccess() lanzaba por Redis,
 * el try/catch de execute() lo trataba como fallo del servicio.
 */
const REDIS_OP_TIMEOUT_MS = 1_500;

async function safeRedis<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Redis op timeout')), REDIS_OP_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    // Fail-open: un outage de Redis jamás debe bloquear ni falsear el
    // estado del circuit breaker ni descartar resultados del servicio.
    logger.warn('[CircuitBreaker] Redis op failed (fail-open):', e);
    return fallback;
  } finally {
    // Evitar timers colgados cuando Redis responde rápido (mantiene la
    // instancia viva innecesariamente y rompe los open-handle checks)
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export class RedisCircuitBreaker {
  private key: string;
  private config: CircuitConfig;

  constructor(serviceName: string, config: Partial<CircuitConfig> = {}) {
    this.key = `circuit_breaker:${serviceName}`;
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 30000, // 30 seconds
      successThreshold: config.successThreshold ?? 2,
    };
  }

  async getState(): Promise<CircuitState> {
    const state = await safeRedis(
      () => redis.get<CircuitState>(`${this.key}:state`),
      CircuitState.CLOSED
    );
    return state || CircuitState.CLOSED;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    if (state === CircuitState.OPEN) {
      const lastFailureTime = await safeRedis<number | null>(
        () => redis.get<number>(`${this.key}:last_failure`),
        null
      );
      const now = Date.now();

      if (lastFailureTime && now - lastFailureTime > this.config.recoveryTimeout) {
        // Transition to HALF_OPEN
        await safeRedis(() => redis.set(`${this.key}:state`, CircuitState.HALF_OPEN), null);
        return this.executeHalfOpen(fn);
      }

      throw new Error(`Circuit is OPEN for service at ${this.key}`);
    }

    if (state === CircuitState.HALF_OPEN) {
      return this.executeHalfOpen(fn);
    }

    // CLOSED state
    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      const successes = await safeRedis<number>(() => redis.incr(`${this.key}:successes`), 1);

      if (successes >= this.config.successThreshold) {
        await this.reset();
      }
      return result;
    } catch (error) {
      await this.onFailure(); // Back to OPEN
      throw error;
    }
  }

  private async onFailure() {
    const failures = await safeRedis<number>(() => redis.incr(`${this.key}:failures`), 1);

    if (failures >= this.config.failureThreshold) {
      await safeRedis(() => redis.set(`${this.key}:state`, CircuitState.OPEN), null);
      await safeRedis(() => redis.set(`${this.key}:last_failure`, Date.now()), null);
      await safeRedis(() => redis.del(`${this.key}:successes`), null);
      logger.warn(`[CircuitBreaker] Service ${this.key} is now OPEN`);
    }
  }

  async onSuccess() {
    await safeRedis(() => redis.del(`${this.key}:failures`), null);
  }

  async reset() {
    await safeRedis(() => redis.set(`${this.key}:state`, CircuitState.CLOSED), null);
    await safeRedis(() => redis.del(`${this.key}:failures`), null);
    await safeRedis(() => redis.del(`${this.key}:successes`), null);
    await safeRedis(() => redis.del(`${this.key}:last_failure`), null);
    logger.info(`[CircuitBreaker] Service ${this.key} is now CLOSED`);
  }
}
