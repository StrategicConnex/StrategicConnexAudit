/**
 * circuit-breaker.ts — Circuit Breakers para APIs externas de terceros.
 *
 * Implementa el patrón Circuit Breaker para proteger integraciones con
 * servicios como GeoIP, WHOIS/RDAP y otras APIs externas de latencia
 * variable o intermitente.
 *
 * Estados del circuito:
 *   CLOSED  → Operación normal. Permite todas las peticiones.
 *   OPEN    → Demasiados fallos. Rechaza requests inmediatamente (fast-fail).
 *   HALF    → Período de prueba. Permite un request de sonda para ver si
 *             el servicio se recuperó.
 *
 *  CLOSED ──[failures >= threshold]──> OPEN
 *  OPEN   ──[resetTimeout elapsed]──> HALF_OPEN
 *  HALF   ──[success]──> CLOSED
 *  HALF   ──[failure]──> OPEN
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  totalRequests: number;
  rejectedRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private openedAt: number | null = null;
  private totalRequests = 0;
  private rejectedRequests = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(options: {
    /** Nombre del circuito (para logs y métricas) */
    name: string;
    /** Número de fallos consecutivos para abrir el circuito */
    failureThreshold?: number;
    /** Tiempo en ms antes de intentar half-open */
    resetTimeoutMs?: number;
    /** Número de éxitos en half-open para cerrar el circuito */
    successThreshold?: number;
  }) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  /**
   * Ejecuta una función protegida por el circuit breaker.
   * Lanza CircuitOpenError si el circuito está OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Verificar si es hora de intentar half-open
    if (this.state === "OPEN") {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        console.log(`[CircuitBreaker:${this.name}] Estado → HALF_OPEN. Intentando recuperación.`);
      } else {
        this.rejectedRequests++;
        throw new CircuitOpenError(
          `Circuito '${this.name}' abierto. Servicio no disponible temporalmente.`,
          this.name,
          this.openedAt ? this.openedAt + this.resetTimeoutMs - Date.now() : this.resetTimeoutMs
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      // No contar errores de "circuito abierto" como fallos nuevos
      if (err instanceof CircuitOpenError) throw err;
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.lastSuccessAt = Date.now();
    this.failures = 0;

    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = "CLOSED";
        this.successes = 0;
        this.openedAt = null;
        console.log(`[CircuitBreaker:${this.name}] Estado → CLOSED. Servicio recuperado.`);
      }
    }
  }

  private onFailure(): void {
    this.lastFailureAt = Date.now();
    this.failures++;
    this.successes = 0;

    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
      console.warn(
        `[CircuitBreaker:${this.name}] Estado → OPEN. ` +
        `${this.failures} fallos consecutivos. ` +
        `Reintento en ${this.resetTimeoutMs / 1000}s.`
      );
    }
  }

  /**
   * Retorna el estado actual del circuito.
   */
  get currentState(): CircuitState {
    // Transición automática OPEN → HALF_OPEN si ha pasado el timeout
    if (
      this.state === "OPEN" &&
      this.openedAt &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  /**
   * Resetea manualmente el circuito al estado CLOSED (útil en admin/debug).
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.openedAt = null;
    console.log(`[CircuitBreaker:${this.name}] Reset manual → CLOSED.`);
  }

  /**
   * Retorna métricas completas del circuito.
   */
  get stats(): CircuitBreakerStats {
    return {
      state: this.currentState,
      failures: this.failures,
      successes: this.successes,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openedAt: this.openedAt,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
    };
  }
}

/**
 * Error lanzado cuando el circuito está OPEN y rechaza la petición.
 */
export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly retryAfterMs: number
  ) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// ─── Instancias de circuitos para cada API externa ───────────────────────────

/**
 * Circuito para la API de GeoIP (freeipapi.com / ip-api.com).
 * 5 fallos consecutivos → abre. Reintentos cada 30 segundos.
 */
export const geoipCircuit = new CircuitBreaker({
  name: "GeoIP",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 2,
});

/**
 * Circuito para consultas WHOIS/RDAP.
 * 3 fallos consecutivos → abre. Reintentos cada 60 segundos.
 */
export const whoisCircuit = new CircuitBreaker({
  name: "WHOIS/RDAP",
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  successThreshold: 1,
});

/**
 * Circuito para Shodan / VirusTotal u otras APIs premium externas.
 * 3 fallos → abre. Recuperación cada 2 minutos.
 */
export const premiumApiCircuit = new CircuitBreaker({
  name: "PremiumAPI",
  failureThreshold: 3,
  resetTimeoutMs: 2 * 60_000,
  successThreshold: 2,
});
