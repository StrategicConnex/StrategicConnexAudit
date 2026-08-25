/**
 * registry.ts — Registro Global de Tools (function calling de OpenRouter).
 *
 * Permite que CUALQUIER tarea AI registre funciones reales del código que el
 * modelo puede decidir invocar. El modelo nunca pasa credenciales ni elige
 * el alcance: el caller fija el contexto (ownership) al registrar los
 * handlers, y el registry valida argumentos con Zod + aplica timeout.
 *
 * Flujo:
 *   1. El caller crea handlers scopeados (ej: solo evidencia de SU proyecto).
 *   2. buildToolDefs(names) genera las OpenRouterToolDef para la request.
 *   3. callAIAgentLoop ejecuta cada tool_call contra el handler registrado.
 */

import { z } from "zod";
import type { OpenRouterToolDef } from "@/server/ai/ai-router";

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: z.infer<TSchema> extends never ? never : TSchema;
  handler: (args: z.output<TSchema>) => Promise<unknown>;
  /** Timeout por invocación (ms). */
  timeoutMs?: number;
}

export type RegisteredTool = Map<string, (args: unknown) => Promise<unknown>>;

const DEFAULT_TOOL_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool ${name} excedió ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Registra un set de tools y devuelve (a) las definiciones para OpenRouter y
 * (b) el mapa de handlers listo para callAIAgentLoop. Los argumentos se
 * validan con Zod ANTES de tocar código real; un error de validación viaja
 * de vuelta al modelo para que corrija, sin romper el bucle.
 */
export function registerTools<T extends z.ZodTypeAny>(
  definitions: Array<ToolDefinition<T>>
): { toolDefs: OpenRouterToolDef[]; handlers: RegisteredTool } {
  const toolDefs: OpenRouterToolDef[] = [];
  const handlers: RegisteredTool = new Map();

  for (const def of definitions) {
    const jsonSchema = z.toJSONSchema(def.parameters as never, { target: "draft-7" }) as Record<string, unknown>;

    toolDefs.push({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: jsonSchema,
      },
    });

    const timeoutMs = def.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    handlers.set(def.name, async (rawArgs: unknown) => {
      const parsed = def.parameters.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        throw new Error(
          `Argumentos inválidos para ${def.name}: ` +
            parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")
        );
      }
      return withTimeout(def.handler(parsed.data), timeoutMs, def.name);
    });
  }

  return { toolDefs, handlers };
}
