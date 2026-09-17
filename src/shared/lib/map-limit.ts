/**
 * map-limit.ts — Concurrencia acotada para fan-out (P2-3).
 *
 * Los crons iteran todos los proyectos; secuencial puro alarga el job hasta
 * el timeout, y Promise.all sin cota pica el plan Hobby y el free-tier IA.
 * mapLimit procesa con N workers: orden de resultados preservado, errores
 * por item (el worker que falla no tumba a los demás si fn los captura).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
