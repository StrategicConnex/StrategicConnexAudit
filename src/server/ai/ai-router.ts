/**
 * ai-router.ts — AI Model Router Engine with OpenRouter Free Model Pool.
 *
 * Routes AI requests through OpenRouter's "openrouter/free" meta-model, which
 * automatically selects the best available free model based on capability needs.
 * Falls back to individual :free models in a chain if the meta-model fails.
 *
 * ✅ NO paid tokens required — just a FREE OpenRouter account
 * ✅ 50 requests/day limit for free accounts (no billing)
 * ✅ 1,000 requests/day after $10 lifetime purchases
 * ✅ 20 free models available as of September 2026 (catálogo /models en vivo)
 * ✅ Graceful degradation: returns contextual messages even without API key
 *
 * FAILOVER ANTI-MONODEPENDENCIA (decisión owner 2026-10-19): si la cadena
 * OpenRouter de la tarea se agota POR COMPLETO, se entra en la cadena de
 * proveedores FALLBACK_PROVIDERS (Groq → Gemini), ambos con endpoints
 * compatibles OpenAI (chat/completions). Cada proveedor tiene su propio
 * circuit breaker y se omite si su clave no está configurada. Los evals con
 * `modelOverride` NO entran en el failover (miden al modelo real, punto).
 */

import { envSecrets } from "@/shared/config/env-secrets";
import { CircuitBreaker } from "@/shared/lib/circuit-breaker";
import { logger } from "@/lib/logger";
import { recordAiUsage } from "./ai-usage";
import { buildSemanticKey, getSemanticCache, setSemanticCache } from "./ai-cache";
import { estimateCostUsd } from "./ai-cost";
import { promptVersion } from "./prompt-version";
import { correlatedHeaders } from "@/lib/request-context";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AITaskType =
  | "copilot-remediation"
  | "incident-brief"
  | "general-chat"
  | "seo-report"
  | "adversary-analysis"
  | "anomaly-narrative"
  | "finding-triage"
  | "exec-brief"
  | "narrated-alert";

// ─── Tools / Structured Outputs (OpenRouter, estándar OpenAI) ────────────────

export interface OpenRouterToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema de los argumentos. */
    parameters: Record<string, unknown>;
  };
}

export interface AIToolCall {
  id: string;
  name: string;
  /** Argumentos crudos (string JSON) — el caller valida con Zod. */
  arguments: string;
}

export type AIResponseFormat =
  { type: "json_schema"; name: string; schema: Record<string, unknown> } | { type: "json_object" };

/** Mensaje tool (resultado de un handler) para el bucle agéntico. */
export interface AIToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export interface AIRequestOptions {
  /** Task type for routing */
  taskType: AITaskType;
  /** Array of messages (system + user) */
  messages: AIMessage[];
  /** Temperature override (default 0.3) */
  temperature?: number;
  /** Max tokens override (default 4096) */
  maxTokens?: number;
  /** Funciones que el modelo puede decidir invocar (function calling). */
  tools?: OpenRouterToolDef[];
  /** Política de invocación (default "auto" cuando hay tools). */
  toolChoice?: "auto" | "none";
  /** Forzar salida JSON estructurada (solo modelos con soporte verificado). */
  responseFormat?: AIResponseFormat;
  /**
   * Usuario que origina la llamada (para telemetría ai_usage y cuotas).
   * Opcional: callers sin usuario (crons) omiten el registro atribuido.
   */
  userId?: string | null;
  /**
   * Ámbito semántico de caché (P1-3), ej. `seo-report:{projectId}:{fecha}`.
   * Regenerar el mismo ámbito dentro del TTL es hit seguro.
   */
  cacheScope?: string;
  /**
   * Desactiva lookup y escritura de caché semántica para esta llamada.
   * Turnos con historia de conversación dependen del hilo: no deben
   * reutilizar respuestas de otros turnos ni contaminar L1/L2 (Sprint 2, C3).
   */
  disableSemanticCache?: boolean;
  /**
   * Fuerza un modelo concreto (Sprint 4 #8: evals del pool). Bypasea la
   * cadena de la task y el cache: mide al modelo real, sin contaminar la
   * caché de producción ni dejar que un hit enmascare un modelo caído.
   */
  modelOverride?: string;
  /**
   * Presupuesto de primer token por intento en streaming (TD-28). Si un modelo
   * no entrega ni un delta en este tiempo, se abandona y sigue la cadena.
   * Sin este tope, un modelo :free congestionado consume el timeout completo
   * de generación (20 s en chat) ANTES de que el siguiente modelo empiece, y
   * el TTFT acaba siendo la suma de intentos muertos. Inyectable para tests.
   */
  firstTokenTimeoutMs?: number;
}

export interface AIResponse {
  success: boolean;
  content: string;
  modelUsed: string;
  latencyMs: number;
  fromCache?: boolean;
  /** Presente cuando el modelo decidió invocar funciones (tools). */
  toolCalls?: AIToolCall[];
  /** Usage real del proveedor cuando lo reporta (Sprint 4: evals por modelo). */
  usage?: AIUsageInfo;
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
 * Re-verificación en vivo 2026-09-16 (barrido de 15 + prompt neutro):
 *   - openrouter/free → EXISTE y enruta (sirvió cohere/north-mini-code:free),
 *     pero devuelve 200 vacío con frecuencia → el chain lo absorbe; sigue
 *     PRIMERO en cadenas de chat (identidad irrelevante) y FUERA de las
 *     JSON-críticas (router aleatorio inaceptable ahí).
 *   - nex-agi/nex-n2.5-pro:free      → FUERA del pool: el catálogo de OpenRouter solo
 *                                     ofrece `nex-agi/nex-n2.5-pro` SIN sufijo :free, y
 *                                     esa variante es de pago. Como el pool es
 *                                     solo-gratuito, el id no se sustituye: cada
 *                                     cadena perdia una posicion y un 404 por
 *                                     intento. Verificado contra /api/v1/models.
 *   - cohere/north-mini-code:free    → respuesta correcta, rápido (326/388ms) ✅ NUEVO
 *   - nvidia/nemotron-3.5-lightning:free → 2× timeout (15s y 20s) hoy ⬇ DEMOTADO
 *   - nvidia/nemotron-3-ultra-550b-a55b:free → 404 del provider 2× hoy (16-sep)
 *     ⬇ FUERA del pool hasta que recupere: ninguna cadena lo incluye.
 *     Retorna si el healthcheck lo marca healthy 2 días seguidos.
 *   - dots-studio/dots-3-note-preview:free → vacío hoy ⬇ DEMOTADO de cadenas chat.
 *   - inclusionai/ling-3.0-flash-*:free, liquid/lfm-2.5:free → vacíos hoy; en observación.
 *   - poolside/laguna-*:free → 429 persistente. nex-mini → timeout.
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
 * Capacidades VERIFICADAS en vivo (scripts/test-model-capabilities.mjs,
 * 2026-08-25): cada modelo pasó una llamada real con `tools` (tool_calls
 * bien formados) y/o con `response_format: json_schema` (JSON válido).
 *
 *   nemotron-3-ultra-550b-a55b:free    → tools ✅  json_schema ✅  (482ms/554ms;
 *                                        OJO: 502 upstream intermitente embebido
 *                                        en HTTP 200 — callModel lo detecta por
 *                                        choices ausente y cae al siguiente)
 *   nemotron-3-nano-omni-30b:free      → tools ✅  json_schema ✅  (458ms/559ms;
 *                                        smoke test E2E del día OK)
 *   nemotron-3-super-120b-a12b:free    → tools ✅  json_schema ❌ (falló en vivo;
 *                                        usar parsing por prompt con este)
 *   nemotron-3.5-lightning:free        → tools ✅  json_schema ❌
 *   dots-3-note-preview:free           → tools ✅  json_schema ⚠️ timeout 45s
 *
 * Retirados del pool ese día:
 *   openai/gpt-oss-20b:free      → 404 "unavailable for free"
 *   google/gemma-4-26b-a4b-it:free → 429 upstream persistente
 */
export const MODEL_CAPABILITIES: Record<
  string,
  { supportsTools: boolean; supportsStructuredOutput: boolean }
> = {
  // ── Failover inter-proveedor (verificados EN VIVO 2026-10-19) ─────────
  // Ambos: tools ✅ (tool_calls bien formados) + json_object ✅.
  // json_schema estricto NO verificado de props externas ho-mana → false
  // (los callers con responseFormat json_schema caerán al self-heal de
  // JSON, mismo criterio que los :free sin schema nativo).
  "groq:openai/gpt-oss-120b": { supportsTools: true, supportsStructuredOutput: true },
  "gemini:gemini-3.8-flash": { supportsTools: true, supportsStructuredOutput: true },
  "nvidia/nemotron-3-ultra-550b-a55b:free": { supportsTools: true, supportsStructuredOutput: true },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    supportsTools: true,
    supportsStructuredOutput: false,
  },
  "nvidia/nemotron-3.5-lightning:free": { supportsTools: true, supportsStructuredOutput: false },
  "dots-studio/dots-3-note-preview:free": { supportsTools: true, supportsStructuredOutput: false },
};

export function modelCapabilities(modelId: string) {
  return MODEL_CAPABILITIES[modelId] ?? { supportsTools: false, supportsStructuredOutput: false };
}

/**
 * Task routing table — maps task types to ordered fallback model chains.
 *
 * CADENAS JSON-CRÍTICAS (adversary-analysis, seo-report): SIN el router
 * aleatorio openrouter/free — solo modelos explícitos verificados en vivo
 * para la capacidad que necesita cada tarea. El router selecciona modelos
 * al azar; cuando la salida debe ser JSON parseable, eso no es aceptable.
 *
 * CADENAS DE CHAT GENERAL: mantienen openrouter/free primero porque la
 * identidad del modelo es irrelevante para texto libre.
 */
export const TASK_ROUTING: Record<AITaskType, string[]> = {
  "copilot-remediation": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "cohere/north-mini-code:free",
  ],
  "incident-brief": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "cohere/north-mini-code:free",
  ],
  "general-chat": [
    FREE_META_MODEL,
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "cohere/north-mini-code:free",
  ],
  // Acotada a 2 modelos con timeout largo (ver MODEL_TIMEOUTS): un reporte
  // ejecutivo de 4096 tokens NO termina en 20s en modelos :free (verificado
  // en producción: 3×20s de timeout → fallback resiliente sin mermaid).
  // Peor caso 2×50s = 100s < maxDuration=120s en Vercel.
  // SIN router: el informe se consume como texto estructurado.
  // Solo modelos verificados en vivo HOY (ultra fuera: 404 persistente).
  "seo-report": [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  // JSON-crítico + function calling: SOLO modelos con verificación en vivo
  // (ver MODEL_CAPABILITIES) y sanos HOY: nano (tools+json OK) y super
  // (tools OK, JSON validado por prompt). Ultra fuera hasta recuperarse.
  "adversary-analysis": [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
  ],
  // Texto libre corto (2-3 líneas): identidad irrelevante, con router.
  "anomaly-narrative": [
    FREE_META_MODEL,
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  // Cadena JSON-crítica: solo modelos con json_schema verificado en vivo
  // (ver MODEL_CAPABILITIES). El router aleatorio openrouter/free queda
  // FUERA — igual que seo-report y adversary-analysis.
  "finding-triage": [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  // Resumen ejecutivo: salida JSON (headline/summary/topRisks/nextSteps)
  // consumida con json_object (mismo criterio del triage del Sprint 2:
  // json_schema estricto sin proveedores :free hoy). Misma cadena verificada
  // en vivo que finding-triage. Corre en Trigger.dev (post-audit).
  "exec-brief": [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  // Narración de alertas: texto libre corto (2-4 frases en español),
  // identidad del modelo irrelevante → cadena con router, igual que
  // anomaly-narrative. Corre en Trigger.dev (dispatch-webhook-task).
  "narrated-alert": [
    FREE_META_MODEL,
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
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
  // Corre dentro de Trigger.dev (sin presupuesto Vercel): los JSON de
  // vulnerabilidades con remediación son generaciones largas.
  "adversary-analysis": 60_000,
  // Texto libre corto (2-3 líneas): presupuesto de chat estándar.
  "anomaly-narrative": 20_000,
  // Corre dentro de Trigger.dev (como adversary-analysis): triage de hasta 40
  // findings en un JSON largo.
  "finding-triage": 60_000,
  // Trigger.dev (post-audit): JSON ejecutivo completo en una generación.
  "exec-brief": 60_000,
  // Trigger.dev (dispatch-webhook): narración de 2-4 frases, presupuesto de chat.
  "narrated-alert": 20_000,
};

/**
 * Presupuesto de PRIMER TOKEN por intento en streaming (TD-28).
 *
 * `MODEL_TIMEOUTS` acota la generación completa, no el arranque: con 20 s por
 * modelo y una cadena de 4, un turno podía pasar 40 s pagando dos modelos que
 * nunca emitían nada antes de llegar al bueno. Medido en producción el
 * 2026-10-30: TTFT p50 9 300 ms y máximos de 50 s, con `openrouter/free` p50
 * 2 421 ms frente a 566 ms del failover. Este presupuesto es ~10× la mediana
 * sana del failover, así que no descarta modelos rápidos: descarta los que no
 * arrancan. Sólo aplica al camino de streaming (el TTFT no existe fuera de él).
 */
export const STREAM_FIRST_TOKEN_TIMEOUT: Record<AITaskType, number> = {
  "general-chat": 6_000,
  "copilot-remediation": 6_000,
  "incident-brief": 6_000,
  "anomaly-narrative": 6_000,
  "narrated-alert": 6_000,
  // Generaciones largas: el arranque legítimo de estos modelos es más lento.
  "seo-report": 12_000,
  "adversary-analysis": 15_000,
  "finding-triage": 15_000,
  "exec-brief": 15_000,
};

/** Combina señales de aborto (Node 20+ trae `AbortSignal.any`; fallback manual). */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// ─── Caché semántica (P1-3) ─────────────────────────────────────────────────
// Reemplaza al Map en memoria con clave de últimos 100 chars (hit-rate ~0).
// Ver src/server/ai/ai-cache.ts: L1 memoria + L2 Postgres (distributed_cache,
// ADR-008 C2), clave sha256 de los mensajes completos + taskType + scope (el
// scope incluye tenant). El L2 tiene TTL cap 1h y soporta invalidación por
// prefijo (cacheDeleteByPrefix) con fail-open.

// ─── Circuit Breaker for OpenRouter ─────────────────────────────────────────

const openRouterCircuitBreaker = new CircuitBreaker("openrouter_api", {
  failureThreshold: 5,
  recoveryTimeout: 30_000,
  successThreshold: 2,
});

// ─── Failover inter-proveedor (decisión owner 2026-10-19) ──────────────────
/**
 * Cadena de proveedores de respaldo tras agotar la cadena OpenRouter de la
 * tarea. Cada entrada es un ENDPOINT COMPATIBLE OpenAI (POST {base}/chat/
 * completions) con Bearer auth. Los modelos y capacidades fueron verificados
 * EN VIVO el 2026-10-19 (chat PONG, json_object, tool calling):
 *
 *   groq:openai/gpt-oss-120b   → 0.65s PONG; json_object ✅ (req 21 in/21 out
 *                                 con reasoning_effort "low"; "none" → 400);
 *                                 tools ✅ (finish: tool_calls, args OK).
 *                                 CATÁLOGO REAL de la org: solo 11 modelos —
 *                                 los :free de la doc vieja (llama-3.1-8b,
 *                                 14.400 RPD) YA NO EXISTEN en la cuenta.
 *                                 Límites free de los chats: RPM 30/RPD 1.000/
 *                                 TPM 8K/TPD 200K.
 *   gemini:gemini-3.8-flash    → ~2.9-4s PONG; json_object ✅; tools ✅
 *                                 (Bearer en /v1beta/openai, formato de clave
 *                                 nuevo AQ.*). Props del free tier: família
 *                                 Flash 3.x/TTS/transcribe; Pro, Argon,
 *                                 Nano Banana y familia imagen/video → pagado.
 *                                 OJO FREE TIER: el contenido se usa para
 *                                 mejorar productos Google (política Free).
 *
 * Sin clave configurada el proveedor se SALTA (degrada silencioso; el guard
 * env-parity del healthcheck lo reporta como booleano). modelUsed viaja con
 * prefijo de proveedor ("groq:...") para desagregar en ai_usage/ai/health.
 */
interface AIFallbackProvider {
  /** Prefijo telemétrico y discriminador de pruebas (groq:xxx, gemini:xxx). */
  id: "groq" | "gemini";
  /** Modelo del proveedor que sirve el failover. */
  model: string;
  getApiKey: () => string;
  /** Base URL compatible OpenAI (OpenRouter-like): se anexa /chat/completions. */
  getBaseUrl: () => string;
  /** Campos extra del body (restricciones del proveedor). */
  extraBody: Record<string, unknown>;
}

export const FALLBACK_PROVIDERS: AIFallbackProvider[] = [
  {
    id: "groq",
    model: "openai/gpt-oss-120b",
    getApiKey: () => envSecrets.groqApiKey,
    getBaseUrl: () => envSecrets.groqBaseUrl,
    // "none" → 400 "must be one of low, medium, high" (verificado live
    // 2026-10-19). "low" mantiene el JSON a cabalidad y ahorra reasoning.
    extraBody: { reasoning_effort: "low" },
  },
  {
    id: "gemini",
    model: "gemini-3.8-flash",
    getApiKey: () => envSecrets.geminiApiKey,
    getBaseUrl: () => envSecrets.geminiBaseUrl,
    extraBody: {},
  },
];

const providerBreakers: Record<"groq" | "gemini", CircuitBreaker> = {
  groq: new CircuitBreaker("groq_api", { failureThreshold: 5, recoveryTimeout: 30_000, successThreshold: 2 }),
  gemini: new CircuitBreaker("gemini_api", { failureThreshold: 5, recoveryTimeout: 30_000, successThreshold: 2 }),
};

/**
 * Presupuesto de wall-clock Vercel: las tasks que corren en routes (≠
 * Trigger.dev) tienen maxDuration=120s (copilot/brief/chat/narrativa/
 * seo-report). El failover solo entra cuando la cadena ya duró los
 * peor-caso: sin este cap, chat (5×20s) + groq + gemini = 140s > 120s y
 * la route aborta A FIL DE TODO. Con el cap, los proveedores se reparten
 * el restante (y se omiten si quedan <8s de "verdadero" presupuesto).
 * Tareas Trigger.dev (adversary-analysis, finding-triage, exec-brief,
 * narrated-alert): sin cap — timeout de task completo por proveedor.
 */
const VERCEL_DEADLINE_MS = 115_000;
const TASKS_WITH_VERCEL_BUDGET: ReadonlySet<AITaskType> = new Set([
  "copilot-remediation",
  "incident-brief",
  "general-chat",
  "anomaly-narrative",
  "seo-report",
]);

// ─── Core AI Call Function ──────────────────────────────────────────────────

/**
 * Calls OpenRouter with the given model and messages.
 * Returns the raw assistant message (content + tool_calls si los hay).
 *
 * Supports both the openrouter/free meta-model router and individual
 * :free model slugs. Both work with a free API key (no billing required).
 */
/** Usage reportado por el proveedor (formato OpenAI: prompt_tokens/completion_tokens). */
export interface AIUsageInfo {
  tokensIn: number | null;
  tokensOut: number | null;
}

interface RawAssistantMessage {
  role?: "assistant";
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  /** Usage real del proveedor cuando lo reporta (Sprint 1 #17). */
  usage?: AIUsageInfo | null;
}

async function callModel(
  modelId: string,
  messages: Array<AIMessage | RawAssistantMessage | AIToolResultMessage>,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
  opts?: {
    tools?: OpenRouterToolDef[];
    toolChoice?: "auto" | "none";
    responseFormat?: AIResponseFormat;
    /** Modelo alternativo al planificado (evals: un solo modelo por llamada). */
    modelOverride?: string;
  }
): Promise<RawAssistantMessage> {
  const baseUrl = envSecrets.openRouterBaseUrl || "https://openrouter.ai/api/v1";
  const apiKey = envSecrets.openRouterApiKey;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not configured. Get a FREE key at https://openrouter.ai/keys — no credit card needed."
    );
  }

  const body: Record<string, unknown> = {
    model: opts?.modelOverride ?? modelId,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (opts?.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts?.responseFormat) {
    if (opts.responseFormat.type === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: opts.responseFormat.name,
          strict: true,
          schema: opts.responseFormat.schema,
        },
      };
      // Solo enrutar a providers que soporten json_schema nativo
      // (docs OpenRouter → Provider Routing / require_parameters).
      body.provider = { ...((body.provider as object) ?? {}), require_parameters: true };
    } else {
      body.response_format = { type: "json_object" };
    }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: correlatedHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://scaudit.app",
      "X-Title": "StrategicAudit Pro",
    }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    if (response.status === 402) {
      throw new Error(
        `OpenRouter 402 — créditos insuficientes para ${modelId}. ` +
          "Los modelos gratuitos no deberían requerir créditos. Agrega fondos o usa otro modelo."
      );
    }

    if (response.status === 429) {
      throw new Error(
        `OpenRouter 429 — límite excedido para ${modelId}: ${text.slice(0, 150)}. ` +
          "Límite gratuito: 50 solicitudes/día. Mejora tu plan o espera."
      );
    }

    throw new Error(`OpenRouter ${response.status} para ${modelId}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  // Usage real del proveedor (idea #17): los :free no siempre lo reportan.
  const usage = data.usage
    ? {
        tokensIn: typeof data.usage.prompt_tokens === "number" ? data.usage.prompt_tokens : null,
        tokensOut:
          typeof data.usage.completion_tokens === "number" ? data.usage.completion_tokens : null,
      }
    : null;

  // Upstream puede devolver HTTP 200 con el error EMBEBIDO (visto con Nvidia:
  // {"error":{...code:502}}) — tratarlo como fallo del modelo para que la
  // cadena caiga al siguiente en vez de devolver basura.
  if (!message || (!message.content && !Array.isArray(message.tool_calls))) {
    const embedded = data.error?.message ?? data.error?.code;
    throw new Error(
      embedded
        ? `Error del proveedor (${modelId}): ${String(embedded).slice(0, 120)}`
        : `Respuesta vacía del modelo ${modelId}`
    );
  }

  return { ...(message as RawAssistantMessage), usage };
}

/**
 * Llamada a un proveedor de FAILOVER (Groq/Gemini) vía su endpoint
 * compatible OpenAI. Espeja a callModel (mismo contrato de body: tools,
 * tool_choice, response_format) con tres diferencias:
 *   1. Auth Bearer de la key del proveedor (Groq ahora emite formato AQ.*).
 *   2. extraBody del proveedor (p. ej. reasoning_effort en Groq).
 *   3. Sin headers HTTP-Referer/X-Title (esas cabeceras son específicas de
 *      OpenRouter; el resto de endpoints OpenAI-compatibles las ignoran).
 * Un json_schema NATIVO se envía igual y si el proveedor lo rechaza (400)
 * la cadena cae al siguiente proveedor: el self-heal de JSON es el plan B.
 */
async function callProviderModel(
  provider: AIFallbackProvider,
  apiKey: string,
  messages: Array<AIMessage | RawAssistantMessage | AIToolResultMessage>,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
  opts?: {
    tools?: OpenRouterToolDef[];
    toolChoice?: "auto" | "none";
    responseFormat?: AIResponseFormat;
  }
): Promise<RawAssistantMessage> {
  const baseUrl = provider.getBaseUrl().replace(/\/+$/, "");
  // Piso de max_tokens para el failover: Groq (gpt-oss) y Gemini (thinking)
  // consumen tokens de razonamiento del MISMO budget max_tokens. Con el cap
  // pequeño de un caller (p. ej. sondas con 16 tokens) el 200 vuelve con
  // content vacío y el guard de abajo lo trataría como fallo del proveedor,
  // encadenando un "chatbot caído" aunque ambos proveedores estén sanos.
  // 512 cubre reasoning "low" + una respuesta breve; los callers de
  // producción (copilot 4096, brief 4096) ya lo superan con holgura.
  const effectiveMaxTokens = Math.max(maxTokens, 512);
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature,
    max_tokens: effectiveMaxTokens,
    ...provider.extraBody,
  };

  if (opts?.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts?.responseFormat) {
    if (opts.responseFormat.type === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: opts.responseFormat.name,
          schema: opts.responseFormat.schema,
        },
      };
    } else {
      body.response_format = { type: "json_object" };
    }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: correlatedHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    if (response.status === 429) {
      throw new Error(
        `${provider.id} 429 — límite free excedido para ${provider.model}: ${text.slice(0, 150)}.`
      );
    }

    throw new Error(`${provider.id} ${response.status} para ${provider.model}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const usage = data.usage
    ? {
        tokensIn: typeof data.usage.prompt_tokens === "number" ? data.usage.prompt_tokens : null,
        tokensOut:
          typeof data.usage.completion_tokens === "number" ? data.usage.completion_tokens : null,
      }
    : null;

  // gpt-oss tiener reasoning tokens del MISMO budget max_tokens: un cap
  // corto devuelve 200 con content vacío → tratarlo como fallo del proveedor
  // para caer al siguiente (mismo criterio que el upstream 502 de Nvidia).
  if (!message || (!message.content && !Array.isArray(message.tool_calls))) {
    const embedded = data.error?.message ?? data.error?.code;
    throw new Error(
      embedded
        ? `Error del proveedor (${provider.id}): ${String(embedded).slice(0, 120)}`
        : `Respuesta vacía de ${provider.id}:${provider.model}`
    );
  }

  return { ...(message as RawAssistantMessage), usage };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calls the AI with automatic model selection and fallback.
 *
 * Uses ONLY free models from OpenRouter — no paid tokens required.
 * Strategy:
 *   1. Check in-memory cache for identical recent requests (5 min TTL;
 *      desactivada cuando hay tools — las respuestas dependen del estado)
 *   2. Recorre la cadena de la tarea: para cadenas JSON-críticas son solo
 *      modelos explícitos verificados; para chat general empieza por el
 *      router openrouter/free
 *   3. Si el modelo devuelve tool_calls, se exponen en AIResponse.toolCalls
 *   4. If no API key configured, return graceful contextual message
 *
 * Rate limits (free tier, no billing):
 *   - 50 requests/day for accounts with < $10 lifetime purchases
 *   - 1,000 requests/day for accounts with >= $10 lifetime purchases
 */
export async function callAIWithFallback(options: AIRequestOptions): Promise<AIResponse> {
  const { taskType, messages, temperature = 0.3, maxTokens = 4096 } = options;
  const startTime = Date.now();
  const useTools = !!options.tools && options.tools.length > 0;

  // Telemetría P0-1: una fila en ai_usage por llamada, fire-and-forget.
  // Sprint 1: prompt_version (#18) + tokens/coste (#17) viajan en cada fila.
  // Sprint 2: se registra TAMBIÉN con userId null (sweeps/crons) — sin la
  // atribución de cuota, pero visible en el dashboard de coste (/ai/health).
  const pVersion = promptVersion(messages);
  const track = (partial: {
    modelUsed: string;
    success: boolean;
    fromCache?: boolean;
    error?: string;
    usage?: AIUsageInfo | null;
  }): AIResponse & { error?: string } => {
    const latencyMs = Date.now() - startTime;
    {
      void recordAiUsage({
        userId: options.userId ?? null,
        taskType,
        modelUsed: partial.modelUsed,
        latencyMs,
        success: partial.success,
        fromCache: partial.fromCache,
        tokensIn: partial.usage?.tokensIn ?? null,
        tokensOut: partial.usage?.tokensOut ?? null,
        costUsd: estimateCostUsd(
          partial.modelUsed,
          partial.usage?.tokensIn,
          partial.usage?.tokensOut
        ),
        promptVersion: pVersion,
      });
    }
    return {
      success: partial.success,
      content: "",
      modelUsed: partial.modelUsed,
      latencyMs,
      ...(partial.fromCache ? { fromCache: true as const } : {}),
      ...(partial.error ? { error: partial.error } : {}),
    };
  };

  // 1. Check cache (solo sin tools: los handlers devuelven estado mutable).
  // P1-3: clave semántica (mensajes completos + scope de tenant) en L1 memoria
  // + L2 Postgres `distributed_cache` (ver ADR-008-AMEND). NO Redis — eliminado
  // por ADR-002 (enmiendas 14-15). Sin cacheScope → scope "global" → solo L1.
  const cacheKey = buildSemanticKey(taskType, options.cacheScope ?? "", messages);
  // modelOverride: evals miden al modelo real — el cache los enmascararía.
  // disableSemanticCache: turnos con historia no deben reutilizar respuestas.
  if (!useTools && !options.modelOverride && !options.disableSemanticCache) {
    const cached = await getSemanticCache(cacheKey);
    if (cached) {
      const res = track({ modelUsed: cached.modelId, success: true, fromCache: true });
      res.content = cached.content;
      return res;
    }
  }

  // 2. Claves de proveedores. OpenRouter es primario: sin su clave SU cadena
  // se omite y la llamada pasa directo al failover Groq/Gemini (2026-10-19,
  // enmienda anti-monodependencia: el caso OpenRouter-sin-key dejaba el
  // chatbot en "IA no configurada" con Groq/Gemini viviendo al lado). El
  // mensaje de onboarding SOLO si no hay NINGÚN proveedor con clave.
  const errors: string[] = [];
  const hasFailoverKey = !!(envSecrets.groqApiKey || envSecrets.geminiApiKey);
  if (!envSecrets.openRouterApiKey) {
    if (!hasFailoverKey) {
      return track({
        modelUsed: "none",
        success: false,
        error:
          "No hay ninguna clave de IA configurada. Configura OPENROUTER_API_KEY " +
          "(primario) o GROQ_API_KEY / GEMINI_API_KEY (failover). " +
          "Get a FREE key at https://openrouter.ai/keys - no credit card needed.",
      });
    }
    errors.push("[openrouter] sin API key en el entorno: cadena de OpenRouter omitida");
    logger.warn("[AI Router] OPENROUTER_API_KEY ausente → failover directo (Groq/Gemini)");
  }

  // 3. Get model chain for this task type. Con modelOverride (evals del
  // pool, Sprint 4 #8) la cadena es de UN modelo y se salta el cache: cada
  // fila de ai_usage queda atribuida al modelo real que se evalúa.
  // Sin clave OpenRouter la cadena es vacía: el for no corre y el flujo cae
  // al bloque de failover inter-proveedor (paso 5).
  const modelChain: string[] = !envSecrets.openRouterApiKey
    ? []
    : options.modelOverride
      ? [options.modelOverride]
      : TASK_ROUTING[taskType] || TASK_ROUTING["general-chat"];

  // 4. Try each model in chain (with circuit breaker protection)
  // Fallback defensivo por si se agrega un AITaskType nuevo sin actualizar
  // MODEL_TIMEOUTS (Record cubre las 4 actuales, pero no cuesta nada).
  const timeoutMs = MODEL_TIMEOUTS[taskType] ?? 20_000;

  for (let i = 0; i < modelChain.length; i++) {
    const modelId = modelChain[i];
    try {
      const message = await openRouterCircuitBreaker.execute(async () => {
        return await callModel(modelId!, messages, temperature, maxTokens, timeoutMs, {
          tools: options.tools,
          toolChoice: options.toolChoice,
          responseFormat: options.responseFormat,
        });
      });

      const latencyMs = Date.now() - startTime;
      const toolCalls: AIToolCall[] | undefined = message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

      // ── Self-healing JSON (Sprint 1, idea #15) ─────────────────────────
      // En tareas JSON-críticas, un JSON roto del modelo es tan fallo como
      // un timeout: reintentar al MISMO modelo inyectando el error de parseo
      // (el modelo corrige con contexto) antes de saltar al siguiente.
      const wantsJson = !!options.responseFormat;
      if (wantsJson && !toolCalls?.length) {
        const parseError = tryParseJson(message.content ?? "");
        if (parseError) {
          const retried = await tryJsonSelfHeal(
            (repairMessages) =>
              callModel(modelId!, repairMessages, temperature, maxTokens, timeoutMs, {
                responseFormat: options.responseFormat,
              }),
            messages,
            message.content ?? "",
            parseError
          );
          if (retried) {
            return finalizeSuccess(retried.content, retried.usage, modelId!, latencyMs);}
          // Sin éxito en el reintento: caer al siguiente modelo de la cadena.
          errors.push(`[${modelId}] JSON inválido tras self-heal: ${parseError.slice(0, 120)}`);
          continue;
        }
      }

      // Cache solo respuestas de contenido puro sin tools (nunca con
      // modelOverride: las respuestas de eval no deben servir a producción).
      if (
        !useTools &&
        !toolCalls?.length &&
        !options.modelOverride &&
        !options.disableSemanticCache
      ) {
        void setSemanticCache(cacheKey, message.content ?? "", modelId!, taskType);
      }

      logger.info(
        `[AI Router] ${taskType} → ${modelId} (${latencyMs}ms)` +
          `${toolCalls?.length ? ` [${toolCalls.length} tool_calls]` : ""} ` +
          `[attempt ${i + 1}/${modelChain.length}]`
      );

      {
        void recordAiUsage({
          userId: options.userId ?? null,
          taskType,
          modelUsed: modelId!,
          latencyMs,
          success: true,
          tokensIn: message.usage?.tokensIn ?? null,
          tokensOut: message.usage?.tokensOut ?? null,
          costUsd: estimateCostUsd(modelId!, message.usage?.tokensIn, message.usage?.tokensOut),
          promptVersion: pVersion,
        });
      }

      return {
        success: true,
        content: message.content ?? "",
        modelUsed: modelId!,
        latencyMs,
        ...(toolCalls?.length ? { toolCalls } : {}),
        ...(message.usage ? { usage: message.usage } : {}),
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`[${modelId}] ${errorMsg}`);
      logger.warn(`[AI Router] Model ${modelId} failed: ${errorMsg}. Trying fallback...`);
    }
  }

  // 5. Cadena OpenRouter agotada → FAILOVER ANTI-MONODEPENDENCIA (2026-10-19,
  // decisión owner que reemplaza la decisión del 10-18). FALLBACK_PROVIDERS
  // (Groq → Gemini): mismo contrato de body (tools/json), circuit breaker
  // propio, saltándose el proveedor sin clave. Los evals (modelOverride)
  // NO entran aquí: miden al modelo real o fallan (cache/enmascaramiento).
  let failoverAttempts = 0;
  if (!options.modelOverride) {
    const elapsedMs = Date.now() - startTime;
    const hasVercelBudget = TASKS_WITH_VERCEL_BUDGET.has(taskType);
    const remainingVercelMs = VERCEL_DEADLINE_MS - elapsedMs - 2_000; // 2s margen de retorno

    for (const provider of FALLBACK_PROVIDERS) {
      const apiKey = provider.getApiKey();
      if (!apiKey) {
        errors.push(`[${provider.id}] sin API key configurada (failover omitido)`);
        continue;
      }
      let timeoutMs = MODEL_TIMEOUTS[taskType] ?? 20_000;
      if (hasVercelBudget) {
        const remaining = Math.min(timeoutMs, remainingVercelMs);
        if (remaining < 8_000) {
          errors.push(`[${provider.id}] presupuesto Vercel agotado (failover omitido)`);
          continue;
        }
        timeoutMs = remaining;
      }

      failoverAttempts++;
      try {
        const message = await providerBreakers[provider.id].execute(async () =>
          callProviderModel(provider, apiKey, messages, temperature, maxTokens, timeoutMs, {
            tools: options.tools,
            toolChoice: options.toolChoice,
            responseFormat: options.responseFormat,
          })
        );

        const latencyMs = Date.now() - startTime;
        const providerModelId = `${provider.id}:${provider.model}`;
        const toolCalls: AIToolCall[] | undefined = message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }));

        // ── Self-healing JSON (mismo criterio que la cadena OpenRouter) ──
        const wantsJson = !!options.responseFormat;
        if (wantsJson && !toolCalls?.length) {
          const parseError = tryParseJson(message.content ?? "");
          if (parseError) {
            const retried = await tryJsonSelfHeal(
              (repairMessages) =>
                callProviderModel(provider, apiKey, repairMessages, temperature, maxTokens, timeoutMs, {
                  responseFormat: options.responseFormat,
                }),
              messages,
              message.content ?? "",
              parseError
            );
            if (retried) {
              return finalizeSuccess(retried.content, retried.usage, providerModelId, latencyMs);
            }
            errors.push(`[${providerModelId}] JSON inválido tras self-heal: ${parseError.slice(0, 120)}`);
            continue;
          }
        }

        // Cache igual que la cadena primaria (idéntico contrato).
        if (
          !useTools &&
          !toolCalls?.length &&
          !options.modelOverride &&
          !options.disableSemanticCache
        ) {
          void setSemanticCache(cacheKey, message.content ?? "", providerModelId, taskType);
        }

        logger.info(
          `[AI Router] failover ${taskType} → ${providerModelId} (${latencyMs}ms, timeout ${timeoutMs}ms)`
        );

        {
          void recordAiUsage({
            userId: options.userId ?? null,
            taskType,
            modelUsed: providerModelId,
            latencyMs,
            success: true,
            tokensIn: message.usage?.tokensIn ?? null,
            tokensOut: message.usage?.tokensOut ?? null,
            costUsd: estimateCostUsd(
              providerModelId,
              message.usage?.tokensIn,
              message.usage?.tokensOut
            ),
            promptVersion: pVersion,
          });
        }

        return {
          success: true,
          content: message.content ?? "",
          modelUsed: providerModelId,
          latencyMs,
          ...(toolCalls?.length ? { toolCalls } : {}),
          ...(message.usage ? { usage: message.usage } : {}),
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`[${provider.id}:${provider.model}] ${errorMsg}`);
        logger.warn(`[AI Router] Failover provider ${provider.id} failed: ${errorMsg}`);
      }
    }
  }

  // 6. All models failed. La cadena OpenRouter ya venía agotada; si hubo
  // failover lo cuentan los errores provider que ya se anexaron a `errors`.
  // Mensaje plano cuando NO hay proveedores de failover configurados:
  // compatibilidad con los tests/dashboards que asertan el texto histórico.
  const failoverNote =
    failoverAttempts > 0
      ? `Failover inter-proveedor también agotado (${failoverAttempts} intento(s)).\n`
      : "";
  return track({
    modelUsed: modelChain[modelChain.length - 1] || "none",
    success: false,
    error: `OpenRouter no disponible. Verificar conectividad y API key.\n${failoverNote}${errors.join("\n")}`,
  });
}

// ─── Self-healing JSON (Sprint 1, idea #15) ─────────────────────────────────

/**
 * Intenta parsear JSON; retorna el mensaje de error de parseo o null si es
 * válido. Los modelos a veces envuelven el JSON en markdown o texto: se
 * acepta el primer bloque {...} balanceado (comportamiento ya asumido por
 * los callers con extractJson).
 */
function tryParseJson(content: string): string | null {
  const trimmed = content.trim();
  // Intento directo primero.
  let directError: string = "JSON inválido";
  try {
    JSON.parse(trimmed);
    return null;
  } catch (e) {
    directError = e instanceof Error ? e.message : "JSON inválido";
  }
  // Extracción del primer objeto/array balanceado (tolera fences markdown).
  const start = trimmed.search(/[{\[]/);
  if (start === -1) return "no contiene JSON";
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return null;
        } catch {
          return directError.slice(0, 200);
        }
      }
    }
  }
  return "JSON sin cerrar";
}

/**
 * Reintento de autocorrección: re-pide al MISMO modelo con el JSON roto y
 * el error de parseo como feedback. Máx 1 intento. null = reintento falló.
 * El `call` es un closure del CANAL real (OpenRouter o proveedor failover):
 * el self-heal re-vuelca los errores al canal donde ya funcionó la llamada.
 */
async function tryJsonSelfHeal(
  call: (repairMessages: AIMessage[]) => Promise<RawAssistantMessage>,
  originalMessages: AIMessage[],
  brokenContent: string,
  parseError: string
): Promise<{ content: string; usage: AIUsageInfo | null } | null> {
  try {
    const repairMessages: AIMessage[] = [
      ...originalMessages,
      {
        role: "assistant",
        content: brokenContent.slice(0, 4000),
      },
      {
        role: "user",
        content:
          `Tu respuesta anterior no es JSON válido. Error de parseo: ${parseError}. ` +
          `Devuelve ÚNICAMENTE el JSON corregido, empezando por { y terminando por }, ` +
          `sin markdown ni texto adicional.`,
      },
    ];
    const message = await call(repairMessages);
    const retryError = tryParseJson(message.content ?? "");
    if (!retryError) {
      logger.info(`[AI Router] JSON self-heal OK (error original: ${parseError.slice(0, 80)})`);
      return { content: message.content ?? "", usage: message.usage ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/** Éxito compartido por el camino normal y el self-heal (telemetría única). */
function finalizeSuccess(
  content: string,
  usage: AIUsageInfo | null,
  modelId: string,
  latencyMs: number
): AIResponse {
  return {
    success: true,
    content,
    modelUsed: modelId,
    latencyMs,
    ...(usage ? { usage } : {}),
  };
}

// ─── Bucle agéntico (function calling con handlers reales) ──────────────────

export interface AgentLoopOptions extends AIRequestOptions {
  /**
   * Handlers registrables por nombre de función. El modelo decide CUÁNDO
   * llamarlos; el registro valida argumentos y ejecuta código real.
   */
  toolHandlers: Map<string, (args: unknown) => Promise<unknown>>;
  /** Máximo de rondas herramienta→modelo (default 6; evita loops infinitos). */
  maxIterations?: number;
}

export interface AgentLoopResult {
  success: boolean;
  content: string;
  modelUsed?: string;
  /** Trazabilidad: qué funciones invocó el modelo y cuántas veces. */
  toolInvocations: Array<{ name: string; ok: boolean }>;
  error?: string;
}

/**
 * Bucle agéntico sobre callAIWithFallback: envía mensajes → si el modelo
 * responde tool_calls, ejecuta los handlers del registro → anexa los
 * resultados como mensajes role:"tool" → repite hasta respuesta final o
 * agotar iteraciones. Compatible con la cadena de fallbacks completa.
 */
export async function callAIAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { toolHandlers, maxIterations = 6, ...aiOptions } = options;
  const conversation: Array<AIMessage | RawAssistantMessage | AIToolResultMessage> = [
    ...aiOptions.messages,
  ];
  const toolInvocations: AgentLoopResult["toolInvocations"] = [];
  let lastModel: string | undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const res = await callAIWithFallback({ ...aiOptions, messages: conversation as AIMessage[] });
    if (!res.success) {
      return {
        success: false,
        content: "",
        toolInvocations,
        modelUsed: lastModel,
        error: res.error,
      };
    }
    lastModel = res.modelUsed;

    // Respuesta final: texto sin más tool_calls
    if (!res.toolCalls || res.toolCalls.length === 0) {
      return { success: true, content: res.content, modelUsed: res.modelUsed, toolInvocations };
    }

    // Anexar el mensaje assistant con las tool_calls (formato OpenAI)
    conversation.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls.map((tc) => ({
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    // Ejecutar cada handler y anexar su resultado
    for (const tc of res.toolCalls) {
      const handler = toolHandlers.get(tc.name);
      let resultPayload: string;
      if (!handler) {
        resultPayload = JSON.stringify({ error: `Función desconocida: ${tc.name}` });
        toolInvocations.push({ name: tc.name, ok: false });
      } else {
        try {
          let args: unknown = {};
          try {
            args = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch {
            /* args vacíos */
          }
          const out = await handler(args);
          resultPayload = JSON.stringify(out ?? { ok: true }).slice(0, 30_000);
          toolInvocations.push({ name: tc.name, ok: true });
        } catch (err) {
          // El error se devuelve AL MODELO para que corrija los argumentos
          resultPayload = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
          toolInvocations.push({ name: tc.name, ok: false });
        }
      }
      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultPayload,
      } satisfies AIToolResultMessage);
    }
  }

  return {
    success: false,
    content: "",
    toolInvocations,
    modelUsed: lastModel,
    error: `Bucle agéntico agotó ${maxIterations} iteraciones sin respuesta final`,
  };
}

// ─── Streaming (Sprint 1 chatbot: respuestas progresivas) ──────────────────
//
// Variante de callAIWithFallback que emite el texto por fragmentos a medida
// que el proveedor lo genera, en lugar de esperar la respuesta completa.
// Mantiene el pipeline del router: caché semántica, cadena de la task, circuit
// breakers, failover Groq→Gemini, presupuesto Vercel y telemetría ai_usage.
// Diferencias con el camino no-stream:
//   • `stream: true` + parseo del SSE con formato OpenAI (data: {...} / [DONE]).
//   • El fallback entre modelos SOLO ocurre antes del primer fragmento
//     entregado: una vez que el cliente vio texto, cambiar de modelo
//     duplicaría contenido. Un corte a mitad se devuelve como success:false
//     con el parcial en `content` para que la ruta lo señale al cliente.
//   • Sin tools ni response_format: el streaming es para chat de texto; las
//     tareas JSON usan callAIWithFallback (que aplica self-heal).

export interface AIStreamResult {
  success: boolean;
  /** Texto acumulado completo (parcial si el stream se cortó a mitad). */
  content: string;
  modelUsed: string;
  latencyMs: number;
  fromCache?: boolean;
  error?: string;
}

interface ConsumedSSE {
  content: string;
  usage: AIUsageInfo | null;
  error: string | null;
}

/**
 * Parsea un body SSE con formato OpenAI (líneas `data: {...}`, fin `[DONE]`).
 * Tolerante a líneas basura y JSON malformado: un chunk inválido no tumba la
 * respuesta. Los deltas `reasoning` de los modelos thinking se ignoran
 * (solo interesa `delta.content`).
 */
async function consumeOpenAiSSE(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
  budget?: { firstTokenTimeoutMs: number; onFirstTokenTimeout?: () => void }
): Promise<ConsumedSSE> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: AIUsageInfo | null = null;
  let error: string | null = null;
  let finished = false;

  // Presupuesto de primer token: compite contra el PRIMER `read()`. Se desarma
  // en cuanto llega un delta, así que no afecta a una generación ya en curso.
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: Promise<never> | null = null;
  if (budget) {
    deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => {
        budget.onFirstTokenTimeout?.();
        reject(new Error(`sin primer token en ${budget.firstTokenTimeoutMs}ms`));
      }, budget.firstTokenTimeoutMs);
    });
    // Si el primer delta llega antes, nadie espera esta promesa: evitar que un
    // rechazo posterior quede sin manejar.
    deadline.catch(() => {});
  }
  const clearDeadline = (): void => {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
    }
    deadline = null;
  };

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      finished = true;
      return;
    }
    let chunk: {
      error?: { message?: string; code?: string } | string;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    // Upstream puede embeber un error en un HTTP 200 (visto con Nvidia).
    if (chunk.error) {
      error = String(
        typeof chunk.error === "string"
          ? chunk.error
          : (chunk.error.message ?? chunk.error.code ?? "error embebido")
      ).slice(0, 200);
      finished = true;
      return;
    }
    if (chunk.usage && typeof chunk.usage.prompt_tokens === "number") {
      usage = {
        tokensIn: chunk.usage.prompt_tokens as number,
        tokensOut:
          typeof chunk.usage.completion_tokens === "number"
            ? chunk.usage.completion_tokens
            : null,
      };
    }
    const delta = chunk.choices?.[0]?.delta;
    if (typeof delta?.content === "string" && delta.content.length > 0) {
      content += delta.content;
      // Primer delta entregado: el intento ya arrancó, sin presupuesto.
      if (deadline) clearDeadline();
      onText(delta.content);
    }
  };

  try {
    for (;;) {
      const readPromise = reader.read();
      // Si pierde la carrera, el read puede rechazar después: no es un error
      // del llamador y no debe aparecer como unhandled rejection.
      readPromise.catch(() => {});
      const { value, done } = deadline
        ? await Promise.race([readPromise, deadline])
        : await readPromise;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        processLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (finished) break;
        newline = buffer.indexOf("\n");
      }
      if (finished) break;
    }
    if (!finished && buffer.length > 0) processLine(buffer);
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    try {
      reader.releaseLock();
    } catch {
      // Queda un read pendiente porque ganó el presupuesto: el cuerpo se
      // abandona (y el AbortController del intento cierra la conexión).
    }
  }

  return { content, usage, error };
}

/**
 * Streaming con fallback: emite `onChunk(text)` por cada delta de texto y
 * devuelve el resultado final (éxito, fallo pre-commit o corte a mitad).
 * Contrato de errores idéntico al no-stream: sin ninguna clave configurada
 * devuelve success:false con el mensaje de onboarding (la ruta lo detecta
 * por regex y responde 200 con el mensaje de bienvenida).
 */
export async function callAIWithFallbackStream(
  options: AIRequestOptions,
  onChunk: (text: string) => void
): Promise<AIStreamResult> {
  if (options.tools?.length || options.responseFormat) {
    throw new Error(
      "callAIWithFallbackStream no soporta tools/responseFormat: usa callAIWithFallback para esas tareas."
    );
  }
  const { taskType, messages, temperature = 0.3, maxTokens = 4096 } = options;
  const startTime = Date.now();
  const pVersion = promptVersion(messages);
  const errors: string[] = [];

  // Primer delta entregado al cliente: base del TTFT (Sprint 1 A2). Null
  // mientras no llegue texto — define también `streamed` en la telemetría
  // (una fila sin ningún chunk no fue una respuesta servida en streaming).
  let firstChunkAtMs: number | null = null;
  const emit = (text: string): void => {
    if (firstChunkAtMs === null) firstChunkAtMs = Date.now();
    onChunk(text);
  };

  const track = (partial: {
    modelUsed: string;
    success: boolean;
    fromCache?: boolean;
    content: string;
    usage?: AIUsageInfo | null;
    error?: string;
  }): AIStreamResult => {
    const latencyMs = Date.now() - startTime;
    void recordAiUsage({
      userId: options.userId ?? null,
      taskType,
      modelUsed: partial.modelUsed,
      latencyMs,
      success: partial.success,
      fromCache: partial.fromCache,
      tokensIn: partial.usage?.tokensIn ?? null,
      tokensOut: partial.usage?.tokensOut ?? null,
      costUsd: estimateCostUsd(
        partial.modelUsed,
        partial.usage?.tokensIn,
        partial.usage?.tokensOut
      ),
      promptVersion: pVersion,
      // Sprint 1 A2: streamed solo si hubo al menos un delta entregado;
      // ttft_ms mide inicio → primer delta (null sin stream).
      streamed: firstChunkAtMs !== null,
      ttftMs: firstChunkAtMs !== null ? firstChunkAtMs - startTime : null,
    });
    return {
      success: partial.success,
      content: partial.content,
      modelUsed: partial.modelUsed,
      latencyMs,
      ...(partial.fromCache ? { fromCache: true as const } : {}),
      ...(partial.error ? { error: partial.error } : {}),
    };
  };

  // 1. Caché semántica: replay en un único chunk (el cliente lo pinta entero).
  const cacheKey = buildSemanticKey(taskType, options.cacheScope ?? "", messages);
  if (!options.modelOverride && !options.disableSemanticCache) {
    const cached = await getSemanticCache(cacheKey);
    if (cached) {
      emit(cached.content);
      return track({
        modelUsed: cached.modelId,
        success: true,
        fromCache: true,
        content: cached.content,
      });
    }
  }

  // 2. Sin NINGÚN proveedor con clave: mismo mensaje que el no-stream (el
  //    regex de la ruta distingue el onboarding de un fallo real).
  const hasFailoverKey = !!(envSecrets.groqApiKey || envSecrets.geminiApiKey);
  if (!envSecrets.openRouterApiKey && !hasFailoverKey) {
    return track({
      modelUsed: "none",
      success: false,
      content: "",
      error:
        "No hay ninguna clave de IA configurada. Configura OPENROUTER_API_KEY " +
        "(primario) o GROQ_API_KEY / GEMINI_API_KEY (failover). " +
        "Get a FREE key at https://openrouter.ai/keys - no credit card needed.",
    });
  }
  if (!envSecrets.openRouterApiKey) {
    errors.push("[openrouter] sin API key en el entorno: cadena de OpenRouter omitida");
  }

  // 3. Cadena de modelos de la task (idéntica al no-stream).
  const modelChain: string[] = !envSecrets.openRouterApiKey
    ? []
    : options.modelOverride
      ? [options.modelOverride]
      : TASK_ROUTING[taskType] || TASK_ROUTING["general-chat"];
  const timeoutMs = MODEL_TIMEOUTS[taskType] ?? 20_000;
  // Tope de arranque por intento: un modelo que no emite no debe consumir el
  // timeout de generación completo antes de que empiece el siguiente (TD-28).
  const firstTokenTimeoutMs =
    options.firstTokenTimeoutMs ?? STREAM_FIRST_TOKEN_TIMEOUT[taskType] ?? 6_000;

  let accumulated = "";

  // 4. Cadena OpenRouter en streaming.
  for (let i = 0; i < modelChain.length; i++) {
    const modelId = modelChain[i]!;
    let emittedThisModel = false;
    // Aborta SOLO este intento cuando vence el presupuesto de primer token.
    const attemptController = new AbortController();
    try {
      // El breaker protege la APERTURA del stream (HTTP + primer byte):
      // consumirlo corre fuera para que un corte a mitad no lo penalice.
      const streamBody = await openRouterCircuitBreaker.execute(async () => {
        const baseUrl = envSecrets.openRouterBaseUrl || "https://openrouter.ai/api/v1";
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: correlatedHeaders({
            "Content-Type": "application/json",
            Authorization: `Bearer ${envSecrets.openRouterApiKey}`,
            "HTTP-Referer": "https://scaudit.app",
            "X-Title": "StrategicAudit Pro",
          }),
          body: JSON.stringify({
            model: modelId,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
            // Param propio de OpenRouter: agrega el chunk final con usage
            // (lo procesa el gateway, no el proveedor upstream).
            usage: { include: true },
          }),
          signal: combineAbortSignals(AbortSignal.timeout(timeoutMs), attemptController.signal),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          if (response.status === 402) {
            throw new Error(`OpenRouter 402 — créditos insuficientes para ${modelId}.`);
          }
          if (response.status === 429) {
            throw new Error(
              `OpenRouter 429 — límite excedido para ${modelId}: ${text.slice(0, 150)}.`
            );
          }
          throw new Error(`OpenRouter ${response.status} para ${modelId}: ${text.slice(0, 200)}`);
        }
        if (!response.body) {
          throw new Error(`Sin body stream de ${modelId}`);
        }
        return response.body;
      });

      const consumed = await consumeOpenAiSSE(
        streamBody,
        (text) => {
          emittedThisModel = true;
          accumulated += text;
          emit(text);
        },
        {
          firstTokenTimeoutMs,
          onFirstTokenTimeout: () => attemptController.abort(),
        }
      );

      if (consumed.error) {
        // Sin texto entregado el modelo simplemente FALLA (sigue la cadena).
        // Con texto ya entregado no hay reintento limpio: parcial + fallo.
        if (!emittedThisModel) throw new Error(consumed.error);
        return track({
          modelUsed: modelId,
          success: false,
          content: accumulated,
          usage: consumed.usage,
          error: `Stream interrumpido por ${modelId}: ${consumed.error}`,
        });
      }
      if (!emittedThisModel) {
        throw new Error(`Respuesta vacía del modelo ${modelId}`);
      }

      if (!options.modelOverride && !options.disableSemanticCache) {
        void setSemanticCache(cacheKey, accumulated, modelId, taskType);
      }
      logger.info(
        `[AI Router] stream ${taskType} → ${modelId} (${Date.now() - startTime}ms) ` +
          `[attempt ${i + 1}/${modelChain.length}]`
      );
      return track({ modelUsed: modelId, success: true, content: accumulated, usage: consumed.usage });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`[${modelId}] ${errorMsg}`);
      logger.warn(`[AI Router] Stream model ${modelId} failed: ${errorMsg}. Trying fallback...`);
    }
  }

  // 5. Cadena OpenRouter agotada → failover Groq → Gemini (mismo contrato).
  let failoverAttempts = 0;
  if (!options.modelOverride) {
    const elapsedMs = Date.now() - startTime;
    const hasVercelBudget = TASKS_WITH_VERCEL_BUDGET.has(taskType);
    const remainingVercelMs = VERCEL_DEADLINE_MS - elapsedMs - 2_000;

    for (const provider of FALLBACK_PROVIDERS) {
      const apiKey = provider.getApiKey();
      if (!apiKey) {
        errors.push(`[${provider.id}] sin API key configurada (failover omitido)`);
        continue;
      }
      let providerTimeoutMs = MODEL_TIMEOUTS[taskType] ?? 20_000;
      if (hasVercelBudget) {
        const remaining = Math.min(providerTimeoutMs, remainingVercelMs);
        if (remaining < 8_000) {
          errors.push(`[${provider.id}] presupuesto Vercel agotado (failover omitido)`);
          continue;
        }
        providerTimeoutMs = remaining;
      }

      failoverAttempts++;
      let emittedThisProvider = false;
      const providerController = new AbortController();
      try {
        const streamBody = await providerBreakers[provider.id].execute(async () => {
          const baseUrl = provider.getBaseUrl().replace(/\/+$/, "");
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: correlatedHeaders({
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            }),
            body: JSON.stringify({
              model: provider.model,
              messages,
              temperature,
              max_tokens: Math.max(maxTokens, 512),
              stream: true,
              ...provider.extraBody,
            }),
            signal: combineAbortSignals(
              AbortSignal.timeout(providerTimeoutMs),
              providerController.signal
            ),
          });
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            if (response.status === 429) {
              throw new Error(
                `${provider.id} 429 — límite free excedido para ${provider.model}: ${text.slice(0, 150)}.`
              );
            }
            throw new Error(
              `${provider.id} ${response.status} para ${provider.model}: ${text.slice(0, 200)}`
            );
          }
          if (!response.body) {
            throw new Error(`Sin body stream de ${provider.id}:${provider.model}`);
          }
          return response.body;
        });

        const providerModelId = `${provider.id}:${provider.model}`;
        const consumed = await consumeOpenAiSSE(
          streamBody,
          (text) => {
            emittedThisProvider = true;
            accumulated += text;
            emit(text);
          },
          {
            firstTokenTimeoutMs,
            onFirstTokenTimeout: () => providerController.abort(),
          }
        );

        if (consumed.error) {
          if (!emittedThisProvider) throw new Error(consumed.error);
          return track({
            modelUsed: providerModelId,
            success: false,
            content: accumulated,
            usage: consumed.usage,
            error: `Stream interrumpido por ${providerModelId}: ${consumed.error}`,
          });
        }
        if (!emittedThisProvider) {
          throw new Error(`Respuesta vacía de ${providerModelId}`);
        }

        if (!options.modelOverride && !options.disableSemanticCache) {
          void setSemanticCache(cacheKey, accumulated, providerModelId, taskType);
        }
        logger.info(`[AI Router] stream failover ${taskType} → ${providerModelId}`);
        return track({
          modelUsed: providerModelId,
          success: true,
          content: accumulated,
          usage: consumed.usage,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`[${provider.id}:${provider.model}] ${errorMsg}`);
        logger.warn(`[AI Router] Stream failover provider ${provider.id} failed: ${errorMsg}`);
      }
    }
  }

  const failoverNote =
    failoverAttempts > 0
      ? `Failover inter-proveedor también agotado (${failoverAttempts} intento(s)).\n`
      : "";
  return track({
    modelUsed: modelChain[modelChain.length - 1] || "none",
    success: false,
    content: accumulated,
    error: `OpenRouter no disponible. Verificar conectividad y API key.\n${failoverNote}${errors.join("\n")}`,
  });
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
      "   ```\n   OPENROUTER_API_KEY=sk-or-v1-...\n   ```\n\n" +
      "**Rate limit:** 50 requests/day (free) or 1,000/day ($10+ purchases).\n" +
      "**Failover built-in:** if OpenRouter is unreachable, the pool routes\n" +
      "through `GROQ_API_KEY` (gpt-oss-120b) or `GEMINI_API_KEY` (gemini-3.8-flash).",
    es:
      "### ⚠️ Copilot de Infraestructura — No Configurado\n\n" +
      "El motor de IA no está activo porque falta la clave de API de OpenRouter " +
      "(`OPENROUTER_API_KEY`) en las variables de entorno del servidor.\n\n" +
      "**Activar es gratis y no requiere tarjeta de crédito:**\n\n" +
      "1. Ve a https://openrouter.ai/keys y crea una cuenta gratuita\n" +
      "2. Genera una API Key (no necesitas agregar saldo)\n" +
      "3. Configúrala en tu archivo `.env.local`:\n" +
      "   ```\n   OPENROUTER_API_KEY=sk-or-v1-...\n   ```\n\n" +
      "**Modelos gratuitos incluidos:** 20+ modelos `:free` del catálogo\n" +
      "vigente de OpenRouter (verificado 2026).\n" +
      "**Límite:** 50 solicitudes/día (sin pago) o 1.000/día (con $10+ compras).\n" +
      "**Failover integrado:** si OpenRouter no responde, el pool enruta por\n" +
      "`GROQ_API_KEY` (gpt-oss-120b) o `GEMINI_API_KEY` (gemini-3.8-flash).",
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
      "It looks like no AI provider is configured on the server: neither\n" +
      "`OPENROUTER_API_KEY` (primary), nor `GROQ_API_KEY` or `GEMINI_API_KEY`\n" +
      "(built-in failover).\n\n" +
      "**Setting one up is free and takes 2 minutes:**\n\n" +
      "1. Sign up for free at https://openrouter.ai/keys (recommended)\n" +
      "2. Generate your API Key (no credit card needed)\n" +
      "3. Add it to your `.env.local` file:\n\n" +
      "```\nOPENROUTER_API_KEY=sk-or-v1-...\n```\n\n" +
      "The pool includes 20+ free models from OpenRouter's current catalog,\n" +
      "plus Groq and Gemini as automatic failover.",
    es:
      "¡Hola! 👋\n\n" +
      "Parece que ningún proveedor de IA está configurado en el servidor: falta\n" +
      "`OPENROUTER_API_KEY` (primario), `GROQ_API_KEY` o `GEMINI_API_KEY`\n" +
      "(failover integrado).\n\n" +
      "**Configurar uno es gratis y toma 2 minutos:**\n\n" +
      "1. Regístrate gratis en https://openrouter.ai/keys (recomendado)\n" +
      "2. Genera tu API Key (sin tarjeta de crédito)\n" +
      "3. Agrega al archivo `.env.local`:\n\n" +
      "```\nOPENROUTER_API_KEY=sk-or-v1-...\n```\n\n" +
      "El pool incluye 20+ modelos `:free` del catálogo vigente de OpenRouter,\n" +
      "más Groq y Gemini como failover automático.",
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
  "adversary-analysis": {
    en:
      "## ⚠️ Real Assessment — AI Analysis Disabled\n\n" +
      "The OpenRouter API key (`OPENROUTER_API_KEY`) is not configured.\n" +
      "Raw evidence was collected and stored; automated vulnerability\n" +
      "classification is unavailable until the key is set.\n\n" +
      "**To enable it:** Set `OPENROUTER_API_KEY` in your server environment.\n" +
      "Sign up free at https://openrouter.ai/keys — no credit card needed.",
    es:
      "## ⚠️ Evaluación Real — Análisis IA Deshabilitado\n\n" +
      "La clave de OpenRouter (`OPENROUTER_API_KEY`) no está configurada.\n" +
      "La evidencia cruda fue recolectada y almacenada; la clasificación\n" +
      "automática de vulnerabilidades no está disponible hasta configurarla.\n\n" +
      "**Para activarla:** Configura `OPENROUTER_API_KEY` en tu servidor.\n" +
      "Regístrate gratis en https://openrouter.ai/keys — sin tarjeta de crédito.",
  },
  "anomaly-narrative": {
    en:
      "Anomaly detected, but the AI narrative is disabled " +
      "(`OPENROUTER_API_KEY` not configured). Check the metric details above.",
    es:
      "Anomalía detectada, pero la narrativa IA está deshabilitada " +
      "(`OPENROUTER_API_KEY` no configurada). Revisa el detalle de la métrica.",
  },
  "finding-triage": {
    en:
      "## ⚠️ Finding Triage — AI Analysis Disabled\n\n" +
      "The OpenRouter API key (`OPENROUTER_API_KEY`) is not configured.\n" +
      "Findings were stored without AI triage (severity suggestion, MITRE mapping)\n" +
      "and will appear with their raw detector classification.",
    es:
      "## ⚠️ Triage de Hallazgos — Análisis IA Deshabilitado\n\n" +
      "La clave de OpenRouter (`OPENROUTER_API_KEY`) no está configurada.\n" +
      "Los hallazgos se guardaron sin triage IA (severidad sugerida, mapeo MITRE)\n" +
      "y aparecerán con la clasificación cruda del detector.",
  },
  "exec-brief": {
    en:
      "## ⚠️ Executive Brief — AI Disabled\n\n" +
      "The OpenRouter API key (`OPENROUTER_API_KEY`) is not configured.\n" +
      "Review the latest audit results directly in the technical findings section.",
    es:
      "## ⚠️ Resumen Ejecutivo — IA Deshabilitada\n\n" +
      "La clave de OpenRouter (`OPENROUTER_API_KEY`) no está configurada.\n" +
      "Consulte los resultados de la última auditoría directamente en la sección\n" +
      "de hallazgos técnicos.",
  },
  "narrated-alert": {
    en:
      "New alert on your project. Open the dashboard to review the details " +
      "and recommended actions.",
    es:
      "Nueva alerta en su proyecto. Abra el panel para revisar los detalles " +
      "y las acciones recomendadas.",
  },
};

/**
 * Returns a contextual AI response when OpenRouter is not configured.
 * Never breaks the UX by showing raw errors.
 *
 * @param taskType - The type of AI task
 * @param locale - Language locale ('es' | 'en'), defaults to 'es'
 */
export function getNoApiKeyResponse(taskType: AITaskType, locale: "es" | "en" = "es"): string {
  return NO_API_KEY_MESSAGES[taskType][locale];
}
