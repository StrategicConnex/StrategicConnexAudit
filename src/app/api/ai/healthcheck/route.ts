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
 * Se ejecuta via Vercel CRON cada 6 horas (ver vercel.json).
 * También se puede invocar manualmente con GET /api/ai/healthcheck.
 *
 * Protección: en producción requiere header "Authorization: Bearer ${CRON_SECRET}".
 * En desarrollo se permite sin auth para facilitar debugging.
 */

import { NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { directDb } from "@/shared/db";
import { aiHealthLogs } from "@/shared/db/schemas/health";
import { logSecurityEvent } from "@/shared/lib/audit-log";
import { TASK_ROUTING } from "@/server/ai/ai-router";

export const maxDuration = 120; // 2 minutes — need time for model fallback chains
export const dynamic = "force-dynamic";

// ─── Modelos únicos a testear ──────────────────────────────────────────────
// Se derivan AUTOMÁTICAMENTE de TASK_ROUTING en ai-router.ts.
// Si se agrega un nuevo modelo a TASK_ROUTING, aparecerá aquí sin cambios manuales.

const MODELS_TO_TEST = [...new Set(Object.values(TASK_ROUTING).flat())];

const TEST_PROMPT = {
  role: "user",
  content: "Responde SOLO con la palabra 'OK' y un emoji. No agregues nada más.",
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

// ─── Test de un modelo individual ───────────────────────────────────────────

async function testModel(modelId: string, timeoutMs = 15_000): Promise<ModelResult> {
  const start = Date.now();

  try {
    const apiKey = env.openRouterApiKey;
    if (!apiKey) {
      return {
        modelId,
        status: "failed",
        latencyMs: Date.now() - start,
        error: "OPENROUTER_API_KEY no configurada",
      };
    }

    const baseUrl = env.openRouterBaseUrl || "https://openrouter.ai/api/v1";

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

// ─── Persistencia en base de datos ─────────────────────────────────────────

async function persistResult(result: HealthCheckResult, triggerSource: string): Promise<string | null> {
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
      },
    }).returning({ id: aiHealthLogs.id });

    return inserted?.id || null;
  } catch (err) {
    console.error("[AI Healthcheck] Failed to persist result:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Handler principal ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // 1. Auth check (solo en producción)
    const authHeader = request.headers.get("authorization");
    if (process.env.NODE_ENV === "production") {
      if (!process.env.CRON_SECRET) {
        console.error(
          "[AI Healthcheck] CRON_SECRET environment variable is not configured. " +
          "Set CRON_SECRET in Vercel environment variables to enable authenticated cron jobs."
        );
        return NextResponse.json({
          success: false,
          error: "CRON_SECRET no configurado en el servidor",
        }, { status: 500 });
      }

      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 2. Extraer trigger source
    const { searchParams } = new URL(request.url);
    const triggerSource = searchParams.get("trigger") || "cron";

    // 3. Testear todos los modelos en paralelo
    const results = await Promise.all(
      MODELS_TO_TEST.map(modelId => testModel(modelId))
    );

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
    healthResult.recordedAt = await persistResult(healthResult, triggerSource);

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
      console.warn(
        `[AI Healthcheck] ${failedModels.length}/${modelsTotal} models FAILED. ` +
        `Events logged to security_audit_logs for SIEM detection.`
      );
    }

    return NextResponse.json({
      success: true,
      ...healthResult,
      durationMs: totalMs,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "development",
    });

  } catch (error) {
    const err = error as { message?: string };
    console.error("[AI Healthcheck] Fatal error:", error);
    return NextResponse.json({
      success: false,
      error: `AI Healthcheck error: ${err.message || "Unknown"}`,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
