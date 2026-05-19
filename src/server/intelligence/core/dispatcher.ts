import { getExecutor } from "./executor-registry";
import { ExecutionContext, ExecutionResult } from "../types/executor.types";
import { getToolDefinition } from "../registry/tool-registry";
import { httpSemaphore, dnsSemaphore } from "./concurrency";
import { executionCache, IntelligenceCache } from "./cache";
import { enforceToolRunPolicy } from "./policy-enforcer";

/**
 * Despacha y ejecuta dinámicamente una herramienta de ciberseguridad
 * bajo un contexto de ejecución, validación de inputs y timeout seguro.
 *
 * Pipeline de ejecución:
 *   0. Validación de plan y registro de usage metering
 *   1. Resolución del ejecutor en el registro
 *   2. Validación Zod de inputs
 *   3. Lookup de caché (evita re-ejecuciones en < TTL)
 *   4. Adquisición de semáforo según categoría (HTTP/DNS)
 *   5. Ejecución con AbortController + timeout
 *   6. Almacenamiento en caché del resultado exitoso
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

  // 0. Enforce subscription tier plan policy and usage metering
  const policy = await enforceToolRunPolicy(toolDef, target, projectId, userId);
  if (!policy.allowed) {
    return {
      success: false,
      output: {},
      findings: [],
      error: policy.reason || `La ejecución de la herramienta '${toolId}' fue bloqueada por política de plan de suscripción.`,
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

  // 2. Verificar caché antes de ejecutar
  const cacheKey = IntelligenceCache.buildKey(toolId, target);
  const cached = executionCache.get<ExecutionResult<any>>(cacheKey);
  if (cached) {
    return { ...cached, output: { ...cached.output, _fromCache: true } };
  }

  // 3. Preparar el ExecutionContext con soporte de timeouts controlados
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

  // 4. Seleccionar semáforo por categoría de herramienta
  const isDnsTool = toolId.startsWith("dns.") || toolId.startsWith("email.");
  const semaphore = isDnsTool ? dnsSemaphore : httpSemaphore;

  try {
    ctx.log(`Despachando ejecutor técnico para la herramienta: ${toolId}`);

    const result = await semaphore.run(async () => {
      return await executor.execute(ctx, validatedInput);
    });

    clearTimeout(timeoutId);

    const finalResult: ExecutionResult<any> = {
      ...result,
      output: {
        ...result.output,
        _logs: logs,
        _fromCache: false,
      },
    };

    // 5. Cachear resultado exitoso para evitar re-ejecuciones innecesarias
    if (result.success) {
      executionCache.set(cacheKey, { ...finalResult, output: { ...result.output } });
    }

    return finalResult;

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
