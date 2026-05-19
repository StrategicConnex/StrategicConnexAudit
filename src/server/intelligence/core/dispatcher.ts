import { getExecutor } from "./executor-registry";
import { ExecutionContext, ExecutionResult } from "../types/executor.types";
import { getToolDefinition } from "../registry/tool-registry";

/**
 * Despacha y ejecuta dinámicamente una herramienta de ciberseguridad
 * bajo un contexto de ejecución, validación de inputs y timeout seguro.
 */
export async function executeTool(
  toolId: string,
  target: string,
  input: Record<string, any>,
  projectId: string,
  investigationId?: string,
  userId?: string
): Promise<ExecutionResult<any>> {
  const executor = getExecutor(toolId);
  const toolDef = getToolDefinition(toolId);

  if (!executor || !toolDef) {
    return {
      success: false,
      output: {},
      findings: [],
      error: `La herramienta '${toolId}' no tiene un ejecutor técnico configurado o no existe en el registro.`,
    };
  }

  // 1. Validar esquemas de entrada de la herramienta
  let validatedInput: any = {};
  try {
    const combinedInput = { ...input, domain: target, host: target, ip: target, url: target };
    validatedInput = executor.validate(combinedInput);
  } catch (err: any) {
    return {
      success: false,
      output: {},
      findings: [],
      error: `Validación de entrada fallida para la herramienta '${toolId}': ${err.message}`,
    };
  }

  // 2. Preparar el ExecutionContext con soporte de timeouts controlados
  const controller = new AbortController();
  const timeoutMs = toolDef.timeoutMs || executor.timeoutMs || 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const logs: string[] = [];
  const ctx: ExecutionContext = {
    projectId,
    investigationId,
    userId,
    signal: controller.signal,
    log(message, payload) {
      const payloadStr = payload ? ` ${JSON.stringify(payload)}` : "";
      logs.push(`[${new Date().toISOString()}] ${message}${payloadStr}`);
      console.log(`[Tool ${toolId}] ${message}${payloadStr}`);
    },
  };

  try {
    ctx.log(`Despachando ejecutor técnico para la herramienta: ${toolId}`);
    const result = await executor.execute(ctx, validatedInput);
    clearTimeout(timeoutId);

    // Adjuntar logs al resultado para su posible persistencia o streaming
    return {
      ...result,
      output: {
        ...result.output,
        _logs: logs,
      },
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    ctx.log(`Fallo crítico de ejecución en la herramienta '${toolId}': ${err.message}`);
    return {
      success: false,
      output: { _logs: logs },
      findings: [],
      error: err.name === "AbortError"
        ? `Tiempo de espera agotado (Timeout de ${timeoutMs}ms) en la herramienta '${toolId}'`
        : `Error de ejecución en la herramienta '${toolId}': ${err.message || err}`,
    };
  }
}
