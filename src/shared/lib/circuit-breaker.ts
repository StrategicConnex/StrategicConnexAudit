import { redis } from './ratelimit';

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
    const state = await redis.get<CircuitState>(`${this.key}:state`);
    return state || CircuitState.CLOSED;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    if (state === CircuitState.OPEN) {
      const lastFailureTime = await redis.get<number>(`${this.key}:last_failure`);
      const now = Date.now();

      if (lastFailureTime && now - lastFailureTime > this.config.recoveryTimeout) {
        // Transition to HALF_OPEN
        await redis.set(`${this.key}:state`, CircuitState.HALF_OPEN);
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
      const successes = await redis.incr(`${this.key}:successes`);
      
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
    const failures = await redis.incr(`${this.key}:failures`);
    
    if (failures >= this.config.failureThreshold) {
      await redis.set(`${this.key}:state`, CircuitState.OPEN);
      await redis.set(`${this.key}:last_failure`, Date.now());
      await redis.del(`${this.key}:successes`);
      console.warn(`[CircuitBreaker] Service ${this.key} is now OPEN`);
    }
  }

  async onSuccess() {
    // Optionally reset failures on success if in CLOSED state
    // For now, we only care about transitions
    await redis.del(`${this.key}:failures`);
  }

  async reset() {
    await redis.set(`${this.key}:state`, CircuitState.CLOSED);
    await redis.del(`${this.key}:failures`);
    await redis.del(`${this.key}:successes`);
    await redis.del(`${this.key}:last_failure`);
    console.log(`[CircuitBreaker] Service ${this.key} is now CLOSED`);
  }
}
