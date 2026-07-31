/**
 * loader.ts — Executor Auto-Discovery Loader
 *
 * Escanea los módulos de executors en busca de archivos que exporten `executor`
 * (ToolExecutor) y opcionalmente `definition` (IntelligenceToolDefinition).
 *
 * Convención:
 *   - Cualquier módulo en este mapa que exporte `export const executor: ToolExecutor`
 *     es auto-descubierto.
 *   - Si también exporta `definition: IntelligenceToolDefinition`, se registra también.
 *   - Si solo exporta executor, se genera una definition mínima desde sus metadatos.
 *
 * IMPORTANTE (build de producción):
 *   Antes se usaba readdirSync(__dirname) + import(join(dir, file)) — un import
 *   dinámico no analizable estáticamente que ROMPÍA `next build` en Turbopack
 *   (Vercel): "Module not found: Can't resolve './ROOT/src/server/intelligence/
 *   executors' <dynamic>". Se reemplazó por un mapa estático de módulos que
 *   Turbopack puede rastrear en build time.
 *
 *   Para agregar un nuevo executor: crear el archivo en executors/ con
 *   `export const executor: ToolExecutor` y AGREGARLO a EXECUTOR_MODULES.
 *
 * La caché de resultados evita escaneos repetidos. El fallback manual en
 * executor-registry.ts y tool-registry.ts sirve cuando el entorno no permite
 * import dinámico (entorno empaquetado como Vercel serverless).
 */

import { ToolExecutor } from "../types/executor.types";
import { IntelligenceToolDefinition, ToolCategory, ToolRisk } from "../registry/tool-registry";

export interface DiscoveredEntry {
  executor: ToolExecutor;
  definition?: IntelligenceToolDefinition;
  sourceFile: string;
}

/**
 * Mapa estático de módulos de executors.
 * Las import() con ruta literal son trazables por Turbopack en build time.
 * Nuevos executors: agregar la entrada aquí.
 */
const EXECUTOR_MODULES: Record<string, () => Promise<Record<string, unknown>>> = {
  "advanced-executors": () => import("./advanced-executors"),
  "cve-lookup": () => import("./cve-lookup"),
  "dns-advanced": () => import("./dns-advanced"),
  "dns-executors": () => import("./dns-executors"),
  "email-executors": () => import("./email-executors"),
  "network-executors": () => import("./network-executors"),
  "osint-executors": () => import("./osint-executors"),
  "subdomain-takeover": () => import("./subdomain-takeover"),
  "technology-profiler": () => import("./technology-profiler"),
  "tls-advanced": () => import("./tls-advanced"),
  "website-executors": () => import("./website-executors"),
  "whois-executors": () => import("./whois-executors"),
};

let cachedResults: DiscoveredEntry[] | null = null;

/**
 * Descubre todos los executors registrados en el mapa estático.
 * Escanea una sola vez y cachea los resultados.
 */
export async function discoverExecutors(): Promise<DiscoveredEntry[]> {
  if (cachedResults) return cachedResults;

  const results: DiscoveredEntry[] = [];

  for (const [sourceFile, loadModule] of Object.entries(EXECUTOR_MODULES)) {
    try {
      const mod = await loadModule();
      const executor = mod["executor"] as ToolExecutor | undefined;
      const definition = mod["definition"] as IntelligenceToolDefinition | undefined;

      if (executor && executor.id) {
        results.push({
          executor,
          definition,
          sourceFile: `${sourceFile}.ts`,
        });
      }
    } catch {
      // Ignorar módulos que no exportan executor
    }
  }

  cachedResults = results;
  return results;
}

/**
 * Construye una IntelligenceToolDefinition mínima a partir de un ToolExecutor.
 * Usada cuando el archivo exporta executor pero no definition explícita.
 *
 * NOTA: inputSchema es undefined — la validación real está en executor.validate().
 * Esta definition es para display/UI (nombre, descripción, categoría, plan).
 * El schema real se resuelve en runtime desde el executor cuando se ejecuta.
 */
export function buildMinimalDefinition(executor: ToolExecutor): Omit<IntelligenceToolDefinition, 'inputSchema'> & { inputSchema: undefined } {
  const category = executor.category as ToolCategory;

  return {
    id: executor.id,
    name: executor.id
      .split(".")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" "),
    category,
    description: `Executor auto-descubierto: ${executor.id}`,
    inputSchema: undefined,
    requiredPlan: "free" as const,
    risk: (executor.category === "network" ? "active-safe" : "passive") as ToolRisk,
    costUnits: 1,
    cacheTtlSeconds: executor.category === "dns" ? 300 : 1800,
    timeoutMs: executor.timeoutMs,
    executor: executor.id,
  };
}

/**
 * Limpia la caché — útil para tests o HMR.
 */
export function clearExecutorCache(): void {
  cachedResults = null;
}
