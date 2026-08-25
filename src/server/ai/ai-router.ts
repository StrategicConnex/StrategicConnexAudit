/**
 * ai-router.ts — AI Model Router Engine with OpenRouter Free Model Pool.
 *
 * Routes AI requests through OpenRouter's "openrouter/free" meta-model, which
 * automatically selects the best available free model based on capability needs.
 * Falls back to individual :free models (Gemini Flash, DeepSeek V3, Llama 4,
 * Mistral Small, Qwen 2.5) in a chain if the meta-model fails.
 *
 * ✅ NO paid tokens required — just a FREE OpenRouter account
 * ✅ 50 requests/day limit for free accounts (no billing)
 * ✅ 1,000 requests/day after $10 lifetime purchases
 * ✅ 15 free models available as of July 2026
 * ✅ Graceful degradation: returns contextual messages even without API key
 */

import { envSecrets } from "@/shared/config/env-secrets";
import { RedisCircuitBreaker } from "@/shared/lib/circuit-breaker";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AITaskType =
  | "copilot-remediation"
  | "incident-brief"
  | "general-chat"
  | "seo-report";

export interface AIRequestOptions {
  /** Task type for routing */
  taskType: AITaskType;
  /** Array of messages (system + user) */
  messages: AIMessage[];
  /** Temperature override (default 0.3) */
  temperature?: number;
  /** Max tokens override (default 4096) */
  maxTokens?: number;
}

export interface AIResponse {
  success: boolean;
  content: string;
  modelUsed: string;
  latencyMs: number;
  fromCache?: boolean;
  error?: string;
}

/**
 * OpenRouter's meta-model router that auto-selects the best available free
 * model based on the request's capability needs (tool-calling, vision,
 * structured outputs, etc.). This is the PRIMARY model for all task types.
 */
const FREE_META_MODEL = "openrouter/free";

/**
 * Fallback chains per task type.
 *
 * Strategy:
 * 1. Try openrouter/free (meta-model router) FIRST — it auto-selects the best
 *    available free model based on the request's requirements.
 * 2. On failure, try individual :free models in a task-optimized order.
 * 3. Keep trying remaining :free models in order until one works.
 *
 * Tested working :free models (live test 2026-08-24, barrido completo del
 * catálogo — ver scripts/test-free-models.mjs):
 *   - nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free   (436ms, general)
 *   - nvidia/nemotron-3-super-120b-a12b:free               (444ms, mejor calidad)
 *   - nvidia/nemotron-3.5-lightning:free                   (459ms, nueva gen)
 *   - nvidia/nemotron-3-ultra-550b-a55b:free               (480ms, 1M ctx)
 *   - dots-studio/dots-3-note-preview:free                 (1178ms, general)
 *
 * Retirados del pool (verificados en live test 2026-08-24):
 *   - nvidia/nemotron-3-nano-30b-a3b:free    → 404, ya no disponible como :free
 *   - google/gemma-4-26b-a4b-it:free         → 429 upstream persistente
 *   - google/gemma-4-31b-it:free             → 429 upstream persistente
 *   - z-ai/glm-5.2:free                      → 429
 *   - thinkingmachines/inkling(-small):free  → 403, solo agentic harnesses
 *   - poolside/laguna-* / cohere/north-mini-code / liquid/lfm-2.5 → respuesta vacía
 *   - nvidia/nemotron-3.5-content-safety:free → clasificador, no chat
 */
/**
 * Task routing table — maps task types to ordered fallback model chains.
 * The first model in each chain is always "openrouter/free" (meta-model router).
 * Subsequent models are individual :free models ordered by capability.
 *
 * This is exported so the healthcheck endpoint can auto-discover which
 * models to test without duplicating the list.
 */
export const TASK_ROUTING: Record<AITaskType, string[]> = {
  "copilot-remediation": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3.5-lightning:free",
    "dots-studio/dots-3-note-preview:free",
  ],
  "incident-brief": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "dots-studio/dots-3-note-preview:free",
  ],
  "general-chat": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-lightning:free",
  ],
  // Acotada a 2 modelos con timeout largo (ver MODEL_TIMEOUTS): un reporte
  // ejecutivo de 4096 tokens NO termina en 20s en modelos :free (verificado
  // en producción: 3×20s de timeout → fallback resiliente sin mermaid).
  // Peor caso 2×50s = 100s < maxDuration=120s en Vercel.
  "seo-report": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  ],
};

/**
 * Timeout por intento de modelo según tarea (ms).
 *
 * Las tareas generativas largas (seo-report: tabla + mermaid, hasta 4096
 * tokens) necesitan mucho más que los 20s de chat corto: en modelos :free
 * la generación de un reporte completo toma 30-70s. Con 20s los 3 intentos
 * se abortaban y el usuario recibía el reporte resiliente sin IA.
 */
export const MODEL_TIMEOUTS: Record<AITaskType, number> = {
  // Cadenas de 5 modelos: 5×20s=100s < maxDuration=120s declarado en cada
  // ruta. Subir el timeout por modelo sin declarar maxDuration rompería el
  // presupuesto de Vercel (Hobby 10s / Pro 60s por defecto).
  "copilot-remediation": 20_000,
  "incident-brief": 20_000,
  "general-chat": 20_000,
  // Reporte largo (tabla + mermaid, hasta 3000 tokens): los modelos :free
  // tardan 30-70s en generarlo. Cadena acotada a 2 modelos → peor caso
  // 2×50s=100s + overhead ≈ 113s < maxDuration=120s.
  "seo-report": 50_000,
};

// ─── Simple In-Memory Response Cache ────────────────────────────────────────

const responseCache = new Map<
  string,
  { content: string; modelId: string; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildCacheKey(taskType: AITaskType, messages: AIMessage[]): string {
  const lastMsg = messages[messages.length - 1]?.content?.slice(0, 100) || "";
  return `${taskType}::${lastMsg}`;
}

function getCached(
  key: string
): { content: string; modelId: string } | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return { content: entry.content, modelId: entry.modelId };
  }
  responseCache.delete(key);
  return null;
}

function setCache(key: string, content: string, modelId: string): void {
  if (responseCache.size > 200) {
    // LRU eviction: delete oldest
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { content, modelId, timestamp: Date.now() });
}

// ─── Circuit Breaker for OpenRouter ─────────────────────────────────────────

const openRouterCircuitBreaker = new RedisCircuitBreaker("openrouter_api", {
  failureThreshold: 5,
  recoveryTimeout: 30_000,
  successThreshold: 2,
});

// ─── Core AI Call Function ──────────────────────────────────────────────────

/**
 * Calls OpenRouter with the given model and messages.
 * Returns the response content or throws on failure.
 *
 * Supports both the openrouter/free meta-model router and individual
 * :free model slugs. Both work with a free API key (no billing required).
 */
async function callModel(
  modelId: string,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  const baseUrl = envSecrets.openRouterBaseUrl || "https://openrouter.ai/api/v1";
  const apiKey = envSecrets.openRouterApiKey;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not configured. Get a FREE key at https://openrouter.ai/keys — no credit card needed."
    );
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://scaudit.app",
      "X-Title": "StrategicAudit Pro",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    // Timeout por tarea (MODEL_TIMEOUTS): los reportes largos necesitan más
    // tiempo que el chat corto. El peor caso por cadena queda dentro de
    // maxDuration=120s en Vercel.
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    if (response.status === 402) {
      throw new Error(
        `OpenRouter 402 — insufficient credits for ${modelId}. ` +
          "Free models should not require credits. Try adding funds or use a different model."
      );
    }

    if (response.status === 429) {
      throw new Error(
        `OpenRouter 429 rate limit for ${modelId}: ${text.slice(0, 150)}. ` +
          "Free tier limit: 50 requests/day. Consider upgrading or waiting."
      );
    }

    throw new Error(
      `OpenRouter ${response.status} for ${modelId}: ${text.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`Empty response from model ${modelId}`);
  }

  return content;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calls the AI with automatic model selection and fallback.
 *
 * Uses ONLY free models from OpenRouter — no paid tokens required.
 * Strategy:
 *   1. Check in-memory cache for identical recent requests (5 min TTL)
 *   2. Try "openrouter/free" (meta-model router that auto-selects best free model)
 *   3. On failure, try specialized :free models in fallback chain
 *   4. If no API key configured, return graceful contextual message
 *
 * Rate limits (free tier, no billing):
 *   - 50 requests/day for accounts with < $10 lifetime purchases
 *   - 1,000 requests/day for accounts with >= $10 lifetime purchases
 */
export async function callAIWithFallback(
  options: AIRequestOptions
): Promise<AIResponse> {
  const { taskType, messages, temperature = 0.3, maxTokens = 4096 } = options;
  const startTime = Date.now();

  // 1. Check cache
  const cacheKey = buildCacheKey(taskType, messages);
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      success: true,
      content: cached.content,
      modelUsed: cached.modelId,
      latencyMs: 0,
      fromCache: true,
    };
  }

  // 2. Check if API key is configured
  if (!envSecrets.openRouterApiKey) {
    return {
      success: false,
      content: "",
      modelUsed: "none",
      latencyMs: Date.now() - startTime,
      error:
        "OPENROUTER_API_KEY is not configured. " +
        "Get a FREE key at https://openrouter.ai/keys — no credit card needed.",
    };
  }

  // 3. Get model chain for this task type
  const modelChain =
    TASK_ROUTING[taskType] || TASK_ROUTING["general-chat"];

  // 4. Try each model in chain (with circuit breaker protection)
  const errors: string[] = [];
  // Fallback defensivo por si se agrega un AITaskType nuevo sin actualizar
  // MODEL_TIMEOUTS (Record cubre las 4 actuales, pero no cuesta nada).
  const timeoutMs = MODEL_TIMEOUTS[taskType] ?? 20_000;

  for (let i = 0; i < modelChain.length; i++) {
    const modelId = modelChain[i];
    try {
      const content = await openRouterCircuitBreaker.execute(async () => {
        return await callModel(modelId!, messages, temperature, maxTokens, timeoutMs);
      });

      const latencyMs = Date.now() - startTime;

      // Cache successful response
      setCache(cacheKey, content, modelId!);

      console.log(
        `[AI Router] ${taskType} → ${modelId} (${latencyMs}ms) ` +
          `[attempt ${i + 1}/${modelChain.length}]`
      );

      return {
        success: true,
        content,
        modelUsed: modelId!,
        latencyMs,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`[${modelId}] ${errorMsg}`);
      console.warn(
        `[AI Router] Model ${modelId} failed: ${errorMsg}. Trying fallback...`
      );
    }
  }

  // 5. All models failed
  return {
    success: false,
    content: "",
    modelUsed: modelChain[modelChain.length - 1]!,
    latencyMs: Date.now() - startTime,
    error: `All ${modelChain.length} AI models failed:\n${errors.join("\n")}`,
  };
}

/**
 * Bilingual template strings for getNoApiKeyResponse.
 * Each task type has an en/es entry.
 */
const NO_API_KEY_MESSAGES: Record<AITaskType, { en: string; es: string }> = {
  "copilot-remediation": {
    en:
      "### ⚠️ Infrastructure Copilot — Not Configured\n\n" +
      "The AI engine is inactive because the OpenRouter API key " +
      "(`OPENROUTER_API_KEY`) is missing from the server environment variables.\n\n" +
      "**Activation is free and requires no credit card:**\n\n" +
      "1. Go to https://openrouter.ai/keys and create a free account\n" +
      "2. Generate an API Key (no balance needed)\n" +
      "3. Add it to your `.env.local` file:\n" +
      '   ```\n   OPENROUTER_API_KEY=sk-or-v1-...\n   ```\n\n' +
      "**Free models included:** Gemini Flash, DeepSeek V3, Llama 4, " +
      "Mistral Small, Qwen 2.5\n" +
      "**Rate limit:** 50 requests/day (free) or 1,000/day ($10+ purchases).",
    es:
      "### ⚠️ Copilot de Infraestructura — No Configurado\n\n" +
      "El motor de IA no está activo porque falta la clave de API de OpenRouter " +
      "(`OPENROUTER_API_KEY`) en las variables de entorno del servidor.\n\n" +
      "**Activar es gratis y no requiere tarjeta de crédito:**\n\n" +
      "1. Ve a https://openrouter.ai/keys y crea una cuenta gratuita\n" +
      "2. Genera una API Key (no necesitas agregar saldo)\n" +
      "3. Configúrala en tu archivo `.env.local`:\n" +
      '   ```\n   OPENROUTER_API_KEY=sk-or-v1-...\n   ```\n\n' +
      "**Modelos gratuitos incluidos:** Gemini Flash, DeepSeek V3, Llama 4, " +
      "Mistral Small, Qwen 2.5\n" +
      "**Límite:** 50 solicitudes/día (sin pago) o 1,000/día (con $10+ compras).",
  },
  "incident-brief": {
    en:
      "## ⚠️ Incident Brief — AI Engine Not Configured\n\n" +
      "To generate automatic executive Incident Briefs, set the " +
      "`OPENROUTER_API_KEY` environment variable with your free OpenRouter key.\n\n" +
      "**Don't have one?** Create a free account at https://openrouter.ai/keys " +
      "— no credit card required to use `:free` models.\n\n" +
      "**Free tier limit:** 50 executive summaries per day.\n\n" +
      "In the meantime, raw findings data is available below.",
    es:
      "## ⚠️ Incident Brief — Motor de IA No Configurado\n\n" +
      "Para generar un Incident Brief ejecutivo automático, configura la variable " +
      "de entorno `OPENROUTER_API_KEY` con tu clave gratuita de OpenRouter.\n\n" +
      "**¿No tienes una?** Crea una cuenta gratis en https://openrouter.ai/keys " +
      "— no se requiere tarjeta de crédito para usar modelos `:free`.\n\n" +
      "**Límite gratuito:** 50 resúmenes ejecutivos por día.\n\n" +
      "Mientras tanto, los datos de hallazgos sin procesar están disponibles abajo.",
  },
  "general-chat": {
    en:
      "Hi there! 👋\n\n" +
      "It looks like the AI API Key is not configured in the server's " +
      "environment variables (`OPENROUTER_API_KEY`).\n\n" +
      "**Setting it up is free and takes 2 minutes:**\n\n" +
      "1. Sign up for free at https://openrouter.ai/keys\n" +
      "2. Generate your API Key (no credit card needed)\n" +
      "3. Add it to your `.env.local` file:\n\n" +
      "```\nOPENROUTER_API_KEY=sk-or-v1-...\n```\n\n" +
      "Available free models include Gemini Flash, DeepSeek V3, " +
      "Llama 4, Mistral Small and Qwen 2.5.",
    es:
      "¡Hola! 👋\n\n" +
      "Parece que la API Key de IA no está configurada en las variables de entorno " +
      "del servidor (`OPENROUTER_API_KEY`).\n\n" +
      "**Configurarla es gratis y toma 2 minutos:**\n\n" +
      "1. Regístrate gratis en https://openrouter.ai/keys\n" +
      "2. Genera tu API Key (sin tarjeta de crédito)\n" +
      "3. Agrega al archivo `.env.local`:\n\n" +
      "```\nOPENROUTER_API_KEY=sk-or-v1-...\n```\n\n" +
      "Los modelos gratuitos disponibles incluyen Gemini Flash, DeepSeek V3, " +
      "Llama 4, Mistral Small y Qwen 2.5.",
  },
  "seo-report": {
    en:
      "## ⚠️ Report with Data — AI Analysis Disabled\n\n" +
      "The artificial intelligence API is not configured on the server.\n\n" +
      "Below are the raw SEO performance metrics " +
      "(clicks, impressions, position, active users). Generative " +
      "AI-powered analysis is currently disabled.\n\n" +
      "**To enable it:** Set `OPENROUTER_API_KEY` in your server environment.\n" +
      "Sign up free at https://openrouter.ai/keys — no credit card needed.",
    es:
      "## ⚠️ Reporte con Datos Sin Análisis IA\n\n" +
      "La API de inteligencia artificial no está configurada en el servidor.\n\n" +
      "A continuación se muestran los datos numéricos de rendimiento SEO " +
      "(clics, impresiones, posición, usuarios activos). El análisis " +
      "generativo potenciado por IA está deshabilitado.\n\n" +
      "**Para activarlo:** Configura `OPENROUTER_API_KEY` en tu servidor.\n" +
      "Regístrate gratis en https://openrouter.ai/keys — sin tarjeta de crédito.",
  },
};

/**
 * Returns a contextual AI response when OpenRouter is not configured.
 * Never breaks the UX by showing raw errors.
 *
 * @param taskType - The type of AI task
 * @param locale - Language locale ('es' | 'en'), defaults to 'es'
 */
export function getNoApiKeyResponse(
  taskType: AITaskType,
  locale: "es" | "en" = "es"
): string {
  return NO_API_KEY_MESSAGES[taskType][locale];
}
