/**
 * concurrency.ts — Promise Pool con semáforo de ejecuciones simultáneas.
 *
 * Controla el máximo de operaciones concurrentes para evitar agotamiento
 * de descriptores de archivo, cuotas de DNS y saturación de APIs externas.
 *
 * Límites por defecto del sistema:
 *   - HTTP/TLS:  máximo 10 requests concurrentes por análisis
 *   - DNS:       máximo 25 resoluciones concurrentes por análisis
 */

export class Semaphore {
  private readonly maxConcurrency: number;
  private currentConcurrency = 0;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    if (maxConcurrency < 1) throw new Error("Semaphore: maxConcurrency debe ser >= 1");
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Adquiere un slot del semáforo. Si no hay slots disponibles, espera en cola.
   */
  async acquire(): Promise<void> {
    if (this.currentConcurrency < this.maxConcurrency) {
      this.currentConcurrency++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Libera un slot del semáforo y despierta el siguiente en cola.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.currentConcurrency--;
    }
  }

  /**
   * Ejecuta una función asíncrona con control de concurrencia.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.currentConcurrency;
  }
}

/**
 * Ejecuta un array de tareas asíncronas en paralelo respetando el límite
 * de concurrencia máxima del semáforo.
 *
 * @param tasks    - Array de funciones que retornan Promises
 * @param maxConcurrency - Máximo de ejecuciones simultáneas
 * @returns Array de resultados en el mismo orden que las tareas de entrada
 */
export async function runWithPool<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number
): Promise<Array<{ success: true; value: T } | { success: false; error: string }>> {
  const semaphore = new Semaphore(maxConcurrency);

  return Promise.all(
    tasks.map(async (task) =>
      semaphore.run(async () => {
        try {
          const value = await task();
          return { success: true as const, value };
        } catch (err: any) {
          return { success: false as const, error: err?.message ?? String(err) };
        }
      })
    )
  );
}

// ─── Instancias globales de semáforos por tipo de operación ───────────────────

/** Semáforo para requests HTTP/TLS (máx. 10 simultáneos por análisis) */
export const httpSemaphore = new Semaphore(10);

/** Semáforo para resoluciones DNS (máx. 25 simultáneas por análisis) */
export const dnsSemaphore = new Semaphore(25);
