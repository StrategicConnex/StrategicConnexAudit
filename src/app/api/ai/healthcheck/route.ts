/**
 * GET /api/ai/healthcheck
 *
 * Verifica que todos los modelos :free configurados en ai-router.ts
 * sigan respondiendo correctamente a través de OpenRouter.
 *
 * Estrategia:
 *   1. Testea cada modelo único de TASK_ROUTING con un prompt mínimo
 *   2. Reporta estado individual (healthy/degraded/failed) + latencia
 *   3. Calcula estado global (all_healthy / partial_failure / all_failed)
 *   4. Persiste resultado en ai_health_logs (tabla de historial)
 *   5. Si hay fallos, registra evento de seguridad para que el SIEM
 *      exporter pueda detectar degradación recurrente
 *
 * Se ejecuta via Vercel CRON diariamente a las 04:00 UTC (ver vercel.json).
 * También se puede invocar manualmente con GET /api/ai/healthcheck.
 *
 * Protección: en producción requiere header "Authorization: Bearer ${CRON_SECRET}".
 * En desarrollo se permite sin auth para facilitar debugging.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { envSecrets } from "@/shared/config/env-secrets";
import { directDb } from "@/shared/db";
import { aiHealthLogs } from "@/shared/db/schemas/health";
import { logSecurityEvent } from "@/shared/lib/audit-log";
import { TASK_ROUTING, FALLBACK_PROVIDERS } from "@/server/ai/ai-router";
import { isCronAuthorized } from "@/server/auth/cron";
import { withRequestContext } from "@/lib/request-context";

export const maxDuration = 120; // 2 minutes — need time for model fallback chains
export const dynamic = "force-dynamic";

// ─── Modelos únicos a testear ──────────────────────────────────────────────
// Se derivan AUTOMÁTICAMENTE de TASK_ROUTING en ai-router.ts.
// Si se agrega un nuevo modelo a TASK_ROUTING, aparecerá aquí sin cambios manuales.

const MODELS_TO_TEST = [...new Set(Object.values(TASK_ROUTING).flat())];

const TEST_PROMPT = {
  role: "user",
  // Prompt neutro en inglés: los micro-prompts imperativos en español
  // ("responde SOLO...") disparaban respuestas 200 vacías en varios
  // proveedores (verificado 2026-09-16). El criterio sigue siendo
  // "respondió contenido", no obediencia de formato.
  content: "Reply with exactly: green orange blue",
};

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface ModelResult {
  modelId: string;
  status: "healthy" | "degraded" | "failed";
  latencyMs: number | null;
  error?: string | null;
  responseSample?: string | null;
}

interface HealthCheckResult {
  overallStatus: "healthy" | "degraded" | "unhealthy";
  modelsHealthy: number;
  modelsFailed: number;
  modelsTotal: number;
  avgLatencyMs: number | null;
  modelResults: ModelResult[];
  recordedAt: string | null;
}

/**
 * Guard de paridad de entorno (2026-10-18): segundo incidente de
 * desincronización — OPENROUTER_API_KEY ausente en Vercel producía
 * "IA muerta en producción" sin señal de monitoreo. Reporta SOLO
 * booleanos de presencia — jamás valores de secretos.
 *
 * 2026-10-19: + groqConfigured/geminiConfigured (failover inter-proveedor).
 * Son RECOMENDADOS, no críticos: su ausencia no dispara env_parity_drift
 * (si OpenRouter vive, la app sirve), pero viaja en metadata de ai_health_logs
 * y en la respuesta para que el owner detecte el drift del failover.
 */
interface EnvParity {
  openrouterConfigured: boolean;
  groqConfigured: boolean;
  geminiConfigured: boolean;
  resendConfigured: boolean;
  telemetryOriginsConfigured: boolean;
}

function computeEnvParity(): EnvParity {
  return {
    openrouterConfigured: !!envSecrets.openRouterApiKey,
    groqConfigured: !!envSecrets.groqApiKey,
    geminiConfigured: !!envSecrets.geminiApiKey,
    resendConfigured: !!process.env.RESEND_API_KEY?.trim(),
    telemetryOriginsConfigured: !!process.env.ALLOWED_TELEMETRY_ORIGINS?.trim(),
  };
}

/** Alerta SIEM solo en producción, solo con nombres de claves (sin valores). */
function logEnvParityAlert(envParity: EnvParity): void {
  const isProduction = process.env.NODE_ENV === "production";
  // CRÍTICAS: la app es inutilizable en producción si faltan.
  const missing: string[] = [];
  if (!envParity.openrouterConfigured) missing.push("OPENROUTER_API_KEY");
  if (!envParity.resendConfigured) missing.push("RESEND_API_KEY");
  if (!envParity.telemetryOriginsConfigured) missing.push("ALLOWED_TELEMETRY_ORIGINS");
  // RECOMENDADAS (failover): visibles, pero no critical.
  const recommended: string[] = [];
  if (!envParity.groqConfigured) recommended.push("GROQ_API_KEY");
  if (!envParity.geminiConfigured) recommended.push("GEMINI_API_KEY");

  if (missing.length > 0 && isProduction) {
    logger.error("AI Healthcheck: env-parity drift en producción", { missing });
    logSecurityEvent("env_parity_drift", {
      path: "/api/ai/healthcheck",
      method: "GET",
      metadata: {
        missingEnvKeys: missing,
        // La alerta dura es para la clave crítica de IA (síntoma en producción).
        openrouterConfigured: envParity.openrouterConfigured,
        // Estado del failover (recomendado, no crítico) — sin valores.
        failoverConfigured: {
          groq: envParity.groqConfigured,
          gemini: envParity.geminiConfigured,
        },
        recommendedMissing: recommended,
        nodeEnv: process.env.NODE_ENV || "development",
      },
    });
  } else if (recommended.length > 0 && isProduction) {
    // Drift silencioso (warn) del failover: sin SIEM Critical — solo log.
    logger.warn("AI Healthcheck: failover IA sin claves recomendadas en producción", {
      recommended,
    });
  }
}

// ─── Test de un modelo individual ───────────────────────────────────────────

async function testModel(modelId: string, timeoutMs = 15_000): Promise<ModelResult> {
  const start = Date.now();

  try {
    const apiKey = envSecrets.openRouterApiKey;
    if (!apiKey) {
      return {
        modelId,
        status: "failed",
        latencyMs: Date.now() - start,
        error: "OPENROUTER_API_KEY no configurada",
      };
    }

    const baseUrl = envSecrets.openRouterBaseUrl || "https://openrouter.ai/api/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://scaudit.app",
        "X-Title": "SCAUDIT AI Healthcheck",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [TEST_PROMPT],
        temperature: 0.1,
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const statusCode = response.status;

      // 429 rate limit = degraded (not a model failure)
      if (statusCode === 429) {
        return {
          modelId,
          status: "degraded",
          latencyMs,
          error: `Rate limited (429): ${text.slice(0, 100)}`,
        };
      }

      // 402 = insufficient credits (not a model failure per se)
      if (statusCode === 402) {
        return {
          modelId,
          status: "degraded",
          latencyMs,
          error: `Insufficient credits (402): ${text.slice(0, 100)}`,
        };
      }

      return {
        modelId,
        status: "failed",
        latencyMs,
        error: `HTTP ${statusCode}: ${text.slice(0, 150)}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const modelUsed = data.model || modelId;

    if (!content || content.trim() === "") {
      return {
        modelId,
        status: "degraded",
        latencyMs,
        error: `Empty response (meta-model routed to content safety model)`,
      };
    }

    // Healthy: responded with content
    return {
      modelId: modelUsed, // report which model actually served
      status: "healthy",
      latencyMs,
      responseSample: content.slice(0, 50),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    // Timeout is degraded, not failed
    if (message.includes("timeout") || message.includes("abort")) {
      return {
        modelId,
        status: "degraded",
        latencyMs,
        error: `Timeout (${timeoutMs}ms): ${message.slice(0, 100)}`,
      };
    }

    return {
      modelId,
      status: "failed",
      latencyMs,
      error: message.slice(0, 200),
    };
  }
}

// ─── Probes del FAILOVER (2026-10-19) ─────────────────────────────────────

/**
 * Probe de un proveedor de failover (Groq/Gemini) contra el mismo TEST_PROMPT.
 * Solo corre si la clave está configurada (failover sin key = registro nulo).
 * max_tokens 100 + reasoning_effort "low" para Groq (gpt-oss consume el cap
 * con reasoning interno: con 10 tokens la probe devolvía 200 vacío ANTES de
 * que el escalado llegara a redactar — verificado 2026-10-19).
 */
async function testFailoverProvider(
  provider: (typeof FALLBACK_PROVIDERS)[number],
  timeoutMs = 15_000
): Promise<ModelResult | null> {
  const modelId = `${provider.id}:${provider.model}`;
  if (!provider.getApiKey()) return null;
  const start = Date.now();
  try {
    const response = await fetch(`${provider.getBaseUrl().replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.getApiKey()}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [TEST_PROMPT],
        temperature: 0.1,
        max_tokens: 100,
        ...provider.extraBody,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 429) {
        return { modelId, status: "degraded", latencyMs, error: `Rate limited (429): ${text.slice(0, 100)}` };
      }
      return { modelId, status: "failed", latencyMs, error: `HTTP ${response.status}: ${text.slice(0, 150)}` };
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content || content.trim() === "") {
      return { modelId, status: "degraded", latencyMs, error: "Respuesta vacía del proveedor de failover" };
    }
    return { modelId, status: "healthy", latencyMs, responseSample: content.slice(0, 50) };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("timeout") || message.includes("abort")) {
      return { modelId, status: "degraded", latencyMs, error: `Timeout (${timeoutMs}ms): ${message.slice(0, 100)}` };
    }
    return { modelId, status: "failed", latencyMs, error: message.slice(0, 200) };
  }
}

// ─── Persistencia en base de datos ─────────────────────────────────────────
async function persistResult(result: HealthCheckResult, triggerSource: string, envParity: EnvParity): Promise<string | null> {
  try {
    const [inserted] = await directDb.insert(aiHealthLogs).values({
      overallStatus: result.overallStatus,
      taskType: "all",
      modelsHealthy: result.modelsHealthy,
      modelsFailed: result.modelsFailed,
      modelsTotal: result.modelsTotal,
      avgLatencyMs: result.avgLatencyMs,
      modelResults: result.modelResults,
      triggerSource,
      metadata: {
        nodeEnv: process.env.NODE_ENV || "development",
        checkedAt: new Date().toISOString(),
        envParity,
      },
    }).returning({ id: aiHealthLogs.id });

    return inserted?.id || null;
  } catch (err) {
    logger.error("AI Healthcheck: Failed to persist result", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ─── Handler principal ──────────────────────────────────────────────────────

async function rawGet(request: Request) {
  const startTime = Date.now();

  // El dashboard del producto consume esta ruta desde el navegador (ver
  // OverviewTab), sin header Authorization. Con CRON_SECRET seteada en
  // .env.local el gate rechazaba con 401 incluso en desarrollo, así que el
  // panel mostraba siempre estado vacío. Solo se abre bajo la opt-in
  // explícita de dev-bypass; en producción el gate de cron sigue mandando.
  const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  try {
    // 1. Auth check (timing-safe, fail-closed en producción sin CRON_SECRET)
    if (!DEV_BYPASS && !isCronAuthorized(request)) {
      const hasSecret = !!process.env.CRON_SECRET;
      logger.error("AI Healthcheck: Rechazada invocación no autorizada", { hasSecret });
      return NextResponse.json({
        success: false,
        error: hasSecret ? "Unauthorized" : "CRON_SECRET no configurado en el servidor",
      }, { status: hasSecret ? 401 : 500 });
    }

    // 2. Extraer trigger source
    const { searchParams } = new URL(request.url);
    const triggerSource = searchParams.get("trigger") || "cron";

    // 2.5. Guard de paridad de entorno: booleanos de presencia de claves
    // críticas + alerta SIEM si falta alguna en producción (sin valores).
    const envParity = computeEnvParity();
    logEnvParityAlert(envParity);

    // 3. Testear todos los modelos en paralelo
    const results = await Promise.all(
      MODELS_TO_TEST.map(modelId => testModel(modelId))
    );

    // 3.5 Probes del failover anti-monodependencia (decisión 2026-10-19):
    // solo proveedores con clave; máximo 2 llamadas más por ciclo de 6h.
    const failoverResults = (
      await Promise.all(FALLBACK_PROVIDERS.map((p) => testFailoverProvider(p)))
    ).filter((r): r is ModelResult => r !== null);
    results.push(...failoverResults);

    const modelsHealthy = results.filter(r => r.status === "healthy").length;
    const modelsDegraded = results.filter(r => r.status === "degraded").length;
    const modelsFailed = results.filter(r => r.status === "failed").length;
    const modelsTotal = results.length;

    // Calcular latencia promedio de los modelos healthy
    const healthyLatencies = results
      .filter(r => r.status === "healthy" && r.latencyMs !== null)
      .map(r => r.latencyMs as number);
    const avgLatencyMs = healthyLatencies.length > 0
      ? Math.round(healthyLatencies.reduce((a, b) => a + b, 0) / healthyLatencies.length)
      : null;

    // Estado global
    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (modelsFailed === 0 && modelsDegraded === 0) {
      overallStatus = "healthy";
    } else if (modelsFailed === modelsTotal) {
      overallStatus = "unhealthy";
    } else {
      overallStatus = "degraded";
    }

    // 4. Armar resultado
    const healthResult: HealthCheckResult = {
      overallStatus,
      modelsHealthy,
      modelsFailed: modelsFailed + modelsDegraded, // degraded counts as failure for alerting
      modelsTotal,
      avgLatencyMs,
      modelResults: results,
      recordedAt: null,
    };

    // 5. Persistir en BD (graceful degradation: si la tabla no existe, continúa)
    healthResult.recordedAt = await persistResult(healthResult, triggerSource, envParity);

    const totalMs = Date.now() - startTime;

    // 6. Alertar mediante SIEM si hay modelos fallando
    // Esto registra eventos de seguridad que el SIEM exporter (cada 5 min)
    // detecta como patrón y envía a Slack/PagerDuty/Splunk.
    const failedModels = results.filter(r => r.status === "failed");
    const degradedModels = results.filter(r => r.status === "degraded");

    for (const model of failedModels) {
      logSecurityEvent("ai_model_health", {
        path: "/api/ai/healthcheck",
        method: "GET",
        metadata: {
          modelId: model.modelId,
          status: "failed",
          latencyMs: model.latencyMs,
          error: model.error,
          overallStatus,
          modelsHealthy,
          modelsFailed: modelsFailed + modelsDegraded,
          modelsTotal,
        },
      });
    }

    // Degradaciones (429, timeout) se loggean como info, no como alerta
    for (const model of degradedModels) {
      logSecurityEvent("invalid_input", {
        path: "/api/ai/healthcheck",
        method: "GET",
        metadata: {
          modelId: model.modelId,
          status: "degraded",
          latencyMs: model.latencyMs,
          error: model.error,
          overallStatus,
        },
      });
    }

    if (failedModels.length > 0) {
      logger.warn("AI Healthcheck: Models FAILED", { message: { failed: failedModels.length, total: modelsTotal } })
    }

    return NextResponse.json({
      success: true,
      ...healthResult,
      envParity,
      durationMs: totalMs,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "development",
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("AI Healthcheck: Fatal error", { error });
    return NextResponse.json({
      success: false,
      error: `AI Healthcheck error: ${errMsg || "Unknown"}`,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export const GET = withRequestContext(rawGet);
