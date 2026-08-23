import { getExecutor, getToolDefinition } from "./tool-registry";
import { ExecutionContext, ExecutionResult } from "../types/executor.types";
import { httpSemaphore, dnsSemaphore } from "./concurrency";
import { executionCache, IntelligenceCache } from "./cache";
import { enforceToolRunPolicy } from "./policy-enforcer";
import { initializePluginExecutors } from "../plugins/plugin-executor";
import { getErrorMessage } from "@/shared/lib/errors";
import net from "node:net";
import dns from "node:dns/promises";

/**
 * Despacha y ejecuta dinámicamente una herramienta de ciberseguridad
 * bajo un contexto de ejecución, validación de inputs y timeout seguro.
 *
 * Pipeline de ejecución:
 *   0. Plugin executor lazy init (si toolId empieza con "plugin.")
 *   1. Validación de plan y registro de usage metering
 *   2. Resolución del ejecutor en el registro
 *   3. Validación Zod de inputs
 *   4. Lookup de caché (evita re-ejecuciones en < TTL)
 *   5. Adquisición de semáforo según categoría (HTTP/DNS)
 *   6. Ejecución con AbortController + timeout
 *   7. Almacenamiento en caché del resultado exitoso
 */
export async function executeTool(
  toolId: string,
  target: string,
  input: Record<string, any>,
  projectId: string,
  investigationId?: string,
  userId?: string
): Promise<ExecutionResult<any>> {
  // 0. Lazy init para plugins — asegura que los executors de plugins
  //    oficiales estén registrados antes de la resolución.
  if (toolId.startsWith("plugin.")) {
    await initializePluginExecutors();
  }

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
    const targetUrl = target.startsWith("http") ? target : `https://${target}`;
    let targetIp = target;
    if (!net.isIP(target)) {
      try {
        const resolved = await dns.resolve4(target);
        if (resolved.length > 0) targetIp = resolved[0];
      } catch {
        // Silently fallback if it cannot be resolved to IP
      }
    }

    const combinedInput = { ...input, domain: target, host: target, ip: targetIp, url: targetUrl };
    validatedInput = executor.validate(combinedInput);
  } catch (err: unknown) {
    return {
      success: false,
      output: {},
      findings: [],
      error: `Validación de entrada fallida para la herramienta '${toolId}': ${getErrorMessage(err)}`,
    };
  }

  // 2. Verificar caché antes de ejecutar
  const cacheKey = IntelligenceCache.buildKey(toolId, target);
  const cached = executionCache.get<ExecutionResult<any>>(cacheKey);
  if (cached) {
    return {
      ...cached,
      output: {
        ...(cached.output as Record<string, unknown>),
        _fromCache: true,
      },
    };
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

    const finalResult: ExecutionResult<Record<string, unknown>> = {
      ...result,
      output: {
        ...(result.output as Record<string, unknown>),
        _logs: logs,
        _fromCache: false,
      },
    };

    // 5. Cachear resultado exitoso para evitar re-ejecuciones innecesarias
    if (result.success) {
      executionCache.set(cacheKey, { ...finalResult, output: { ...(result.output as Record<string, unknown>) } });
    }

    return finalResult;

  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = getErrorMessage(err);
    ctx.log(`Fallo crítico de ejecución en la herramienta '${toolId}': ${msg}`);
    return {
      success: false,
      output: { _logs: logs },
      findings: [],
      error: isAbort
        ? `Tiempo de espera agotado (Timeout de ${timeoutMs}ms) en la herramienta '${toolId}'`
        : `Error de ejecución en la herramienta '${toolId}': ${msg}`,
    };
  }
}
