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

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
}

/**
 * Estado de los circuitos por servicio, en memoria de la instancia.
 *
 * Tras eliminar `@upstash/redis` el bookkeeping deja de ser remoto: todas
 * las operaciones son síncronas y no puede existir un outage externo que
 * desorqueste el breaker. Contrapartida (mismo tradeoff que el rate limit,
 * ADR-002): el estado es por instancia serverless, no global.
 *
 * Consecuencia directa positiva: desaparece el timeout de 1.5s que se
 * aplicaba a cada lectura/escritura de bookkeeping — en el router IA eso
 * sumaba latencia crítica (504 de Vercel a los 120s) y podía DESECHAR un
 * resultado de modelo exitoso si el guardado lanzaba.
 */
const circuits = new Map<string, CircuitEntry>();

function entryOf(key: string): CircuitEntry {
  let entry = circuits.get(key);
  if (!entry) {
    entry = { state: CircuitState.CLOSED, failures: 0, successes: 0, lastFailure: null };
    circuits.set(key, entry);
  }
  return entry;
}

/** Solo para tests: vacía el estado en memoria de todos los circuitos. */
export function resetAllCircuits(): void {
  circuits.clear();
}

export class CircuitBreaker {
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
    return entryOf(this.key).state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const entry = entryOf(this.key);

    if (entry.state === CircuitState.OPEN) {
      const now = Date.now();

      if (entry.lastFailure && now - entry.lastFailure > this.config.recoveryTimeout) {
        // Transition to HALF_OPEN
        entry.state = CircuitState.HALF_OPEN;
        return this.executeHalfOpen(fn);
      }

      throw new Error(`Circuit is OPEN for service at ${this.key}`);
    }

    if (entry.state === CircuitState.HALF_OPEN) {
      return this.executeHalfOpen(fn);
    }

    // CLOSED state
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    const entry = entryOf(this.key);
    try {
      const result = await fn();
      entry.successes += 1;

      if (entry.successes >= this.config.successThreshold) {
        this.resetState();
      }
      return result;
    } catch (error) {
      this.onFailure(); // Back to OPEN
      throw error;
    }
  }

  private onFailure(): void {
    const entry = entryOf(this.key);
    entry.failures += 1;
    entry.lastFailure = Date.now();

    if (entry.failures >= this.config.failureThreshold) {
      entry.state = CircuitState.OPEN;
      entry.successes = 0;
      logger.warn(`[CircuitBreaker] Service ${this.key} is now OPEN`);
    }
  }

  async onSuccess(): Promise<void> {
    entryOf(this.key).failures = 0;
  }

  async reset(): Promise<void> {
    this.resetState();
    logger.info(`[CircuitBreaker] Service ${this.key} is now CLOSED`);
  }

  private resetState(): void {
    const entry = entryOf(this.key);
    entry.state = CircuitState.CLOSED;
    entry.failures = 0;
    entry.successes = 0;
    entry.lastFailure = null;
  }
}
