/**
 * cache.ts — Caché TTL-aware en memoria con fallback estructurado.
 *
 * Evita el abuso de cuotas y garantiza latencias bajas en ejecuciones
 * sucesivas del mismo dominio/herramienta en el Cockpit de Inteligencia.
 *
 * Características:
 * - TTL configurable por entrada (default 5 minutos)
 * - LRU eviction automático cuando se supera el límite de entradas
 * - Métricas de hit/miss para observabilidad
 * - Thread-safe: JavaScript single-threaded garantiza consistencia
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRatio: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos
const DEFAULT_MAX_SIZE = 500;          // máximo de entradas en memoria

export class IntelligenceCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  // Métricas internas
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  constructor(options: { ttlMs?: number; maxSize?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /**
   * Genera la clave de caché compuesta por herramienta + target normalizado.
   */
  static buildKey(toolId: string, target: string): string {
    return `${toolId}::${target.toLowerCase().trim()}`;
  }

  /**
   * Recupera una entrada válida del caché. Retorna undefined si expiró o no existe.
   */
  get<R = T>(key: string): R | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      // Entrada expirada: eliminamos de forma perezosa (lazy eviction)
      this.store.delete(key);
      this._misses++;
      return undefined;
    }

    entry.hits++;
    this._hits++;
    return entry.value as unknown as R;
  }

  /**
   * Almacena un valor en el caché con TTL configurable.
   * Si el store está lleno, expulsa la entrada más antigua (FIFO approximado).
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Eviction si superamos el límite
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this._evictions++;
      }
    }

    const expiresAt = Date.now() + (ttlMs ?? this.ttlMs);
    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
      hits: 0,
    });
  }

  /**
   * Patrón get-or-compute: retorna el valor cacheado o ejecuta el callback
   * para generarlo y almacenarlo automáticamente.
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    ttlMs?: number
  ): Promise<{ value: T; fromCache: boolean }> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return { value: cached, fromCache: true };
    }

    const value = await compute();
    this.set(key, value, ttlMs);
    return { value, fromCache: false };
  }

  /**
   * Invalida manualmente una entrada por su clave.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Invalida todas las entradas que pertenezcan a un target específico.
   */
  invalidateTarget(target: string): number {
    const normalizedTarget = target.toLowerCase().trim();
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(`::${normalizedTarget}`)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Purga de forma activa todas las entradas expiradas del store.
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Limpia todo el caché.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Retorna estadísticas de rendimiento del caché.
   */
  get stats(): CacheStats {
    const total = this._hits + this._misses;
    return {
      size: this.store.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRatio: total > 0 ? Math.round((this._hits / total) * 100) / 100 : 0,
    };
  }
}

// ─── Instancias globales por tipo de datos ────────────────────────────────────

/** Caché para resultados de ejecución de herramientas (5 min TTL) */
export const executionCache = new IntelligenceCache({
  ttlMs: 5 * 60 * 1000,
  maxSize: 500,
});

/** Caché para resoluciones DNS (10 min TTL — los registros DNS cambian poco) */
export const dnsCache = new IntelligenceCache({
  ttlMs: 10 * 60 * 1000,
  maxSize: 1000,
});

/** Caché para datos GeoIP/ASN (30 min TTL — muy estables) */
export const geoipCache = new IntelligenceCache({
  ttlMs: 30 * 60 * 1000,
  maxSize: 200,
});
