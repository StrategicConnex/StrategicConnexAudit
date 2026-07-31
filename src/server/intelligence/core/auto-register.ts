/**
 * auto-register.ts — Unified Executor Registration
 *
 * Provee una función `registerExecutor()` que registra un ToolExecutor + su
 * IntelligenceToolDefinition en ambos registros (executor y tool) con una
 * sola llamada.
 *
 * También mantiene un map de todos los executors auto-registrados para que
 * executor-registry.ts y tool-registry.ts puedan consultar los descubiertos
 * dinámicamente por el loader.
 */

import { z } from "zod";
import { ToolExecutor } from "../types/executor.types";
import { IntelligenceToolDefinition, ToolCategory } from "../registry/tool-registry";
import { registerDynamicExecutor } from "./executor-registry";
import { registerDynamicToolDefinition } from "../registry/tool-registry";

// ─── Global registry for auto-discovered executors ─────────────────────────

const autoExecutorMap = new Map<string, ToolExecutor>();
const autoDefinitionMap = new Map<string, IntelligenceToolDefinition>();

/**
 * Registra un executor + su definición en ambos registros con una sola llamada.
 * El executor se registra como dinámico (resuelto después de los nativos),
 * lo que permite que los executors manuales tengan prioridad.
 *
 * @param executor  Instancia del ToolExecutor
 * @param definition Definición opcional — si no se provee, se genera una mínima
 */
export function registerExecutor(
  executor: ToolExecutor,
  definition?: IntelligenceToolDefinition
): void {
  if (!executor || !executor.id) {
    console.warn("[AutoRegister] Intento de registrar executor inválido (sin id)");
    return;
  }

  // Almacenar en maps internos para consulta desde registries
  if (!autoExecutorMap.has(executor.id)) {
    autoExecutorMap.set(executor.id, executor);
  }

  const def = definition ?? {
    id: executor.id,
    name: executor.id
      .split(".")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" "),
    category: executor.category as ToolCategory,
    description: `Auto-registrado: ${executor.id}`,
    inputSchema: z.object({ target: z.string().min(1).max(2048).optional() }).passthrough(),
    requiredPlan: "free" as const,
    risk: "passive" as const,
    costUnits: 1,
    cacheTtlSeconds: 1800,
    timeoutMs: executor.timeoutMs,
    executor: executor.id,
  };

  if (!autoDefinitionMap.has(executor.id)) {
    autoDefinitionMap.set(executor.id, def);
  }

  // Registrar en los registros dinámicos (resolución después de nativos)
  registerDynamicExecutor(executor.id, executor);
  registerDynamicToolDefinition(def);
}

/**
 * Retorna todos los executors auto-registrados (descubiertos vs explícitos).
 */
export function getAutoExecutor(id: string): ToolExecutor | undefined {
  return autoExecutorMap.get(id);
}

/**
 * Retorna todas las definiciones auto-registradas.
 */
export function getAutoDefinition(id: string): IntelligenceToolDefinition | undefined {
  return autoDefinitionMap.get(id);
}

/**
 * Retorna los IDs de todos los executors auto-registrados.
 */
export function getAutoExecutorIds(): string[] {
  return Array.from(autoExecutorMap.keys());
}

/**
 * Retorna todas las definiciones auto-registradas como array.
 */
export function getAutoDefinitions(): IntelligenceToolDefinition[] {
  return Array.from(autoDefinitionMap.values());
}

/**
 * Limpia todos los registros auto — útil para tests o HMR.
 */
export function clearAutoRegistry(): void {
  autoExecutorMap.clear();
  autoDefinitionMap.clear();
}
