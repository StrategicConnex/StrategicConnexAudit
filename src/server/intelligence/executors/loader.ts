/**
 * loader.ts — Executor Auto-Discovery Loader
 *
 * Escanea el directorio executors/ en busca de archivos que exporten `executor`
 * (ToolExecutor) y opcionalmente `definition` (IntelligenceToolDefinition).
 *
 * Convención:
 *   - Cualquier archivo .ts en executors/ (excepto .test.ts, loader.ts, index.ts)
 *     que exporte `export const executor: ToolExecutor = { ... }` es auto-descubierto.
 *   - Si también exporta `definition: IntelligenceToolDefinition`, se registra también.
 *   - Si solo exporta executor, se genera una definition mínima desde sus metadatos.
 *
 * La caché de resultados evita escaneos repetidos. El fallback manual en
 * executor-registry.ts y tool-registry.ts sirve cuando FS no está disponible
 * (entorno empaquetado como Vercel serverless).
 */

import { readdirSync } from "fs";
import { join } from "path";
import { ToolExecutor } from "../types/executor.types";
import { IntelligenceToolDefinition, ToolCategory, ToolRisk } from "../registry/tool-registry";

export interface DiscoveredEntry {
  executor: ToolExecutor;
  definition?: IntelligenceToolDefinition;
  sourceFile: string;
}

let cachedResults: DiscoveredEntry[] | null = null;

/** Archivos que NO deben escanearse como executors */
const EXCLUDED_FILES = new Set([
  "loader.ts", "loader.js",
  "index.ts", "index.js",
  "executors.test.ts", "executors.test.js",
]);

/**
 * Descubre todos los executors en el directorio actual.
 * Escanea el FS una sola vez y cachea los resultados.
 */
export async function discoverExecutors(): Promise<DiscoveredEntry[]> {
  if (cachedResults) return cachedResults;

  const dir = __dirname;
  const results: DiscoveredEntry[] = [];

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => {
      const ext = f.endsWith(".ts") || f.endsWith(".js");
      return ext && !EXCLUDED_FILES.has(f) && !f.startsWith("_");
    });
  } catch {
    // FS no disponible (Vercel serverless, entorno empaquetado)
    cachedResults = [];
    return cachedResults;
  }

  for (const file of files) {
    try {
      const mod = await import(join(dir, file));
      const executor: ToolExecutor | undefined = mod.executor;
      const definition: IntelligenceToolDefinition | undefined = mod.definition;

      if (executor && executor.id) {
        results.push({
          executor,
          definition,
          sourceFile: file,
        });
      }
    } catch {
      // Ignorar archivos que no exportan executor
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
