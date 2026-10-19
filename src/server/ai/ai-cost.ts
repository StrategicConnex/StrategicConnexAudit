/**
 * ai-cost.ts — Coste estimado por llamada IA (Sprint 1, idea #17 del roadmap).
 *
 * Pool actual (apertura anti-monodependencia, 2026-10-19): primario OpenRouter
 * (meta-modelo + cadena :free) y failover inter-proveedor Groq/Gemini. Los
 * tres canales sirven con claves FREE:
 *
 *   - Modelos `:free` y `openrouter/free` (OpenRouter) → coste 0
 *   - Groq `openai/gpt-oss-120b` y Gemini `gemini-3.8-flash` (free tier) → 0
 *   - Modelos de pago futuros → añadir entrada a COST_TABLE_USD
 *
 * El estimado se registra por llamada en `ai_usage.cost_usd` (modelUsed con
 * prefijo de proveedor: `groq:…` / `gemini:…`) y el dashboard /ai/health lo
 * agrega por task type. Es una ESTIMACIÓN: los precios pueden cambiar; nunca
 * usar para facturación real.
 */

/** Precio USD por millón de tokens (in / out). */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Tabla de precios (USD / 1M tokens) de los modelos de pago que el router
 * podría usar. Los `:free` no aparecen: estimateCostUsd los trata como 0 sin
 * necesidad de entrada. POOL OPENROUTER-ONLY hoy: vacía; fill con modelos
 * de pago cuando el presupuesto lo active.
 */
export const COST_TABLE_USD: Record<string, ModelPricing> = {};

export interface UsageEstimate {
  tokensIn: number;
  tokensOut: number;
  /** Coste estimado USD de ESTA llamada (0 para modelos :free). */
  costUsd: number;
}

/**
 * Estima el coste de una llamada. Reglas:
 *  - Sin usage del proveedor → coste 0 (desconocido, no inventamos tokens).
 *  - `:free` / `openrouter/free` → 0 aunque venga usage.
 *  - Conocido en COST_TABLE_USD → tokens × precio.
 *  - Desconocido y de pago → 0 pero no revienta (la telemetría jamás lanza).
 */
export function estimateCostUsd(
  modelUsed: string,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined
): number {
  if (!tokensIn && !tokensOut) return 0;
  // Router meta-modelo y variantes :free: coste cero por diseño.
  if (modelUsed === "openrouter/free" || modelUsed.endsWith(":free")) return 0;
  const pricing = COST_TABLE_USD[modelUsed];
  if (!pricing) return 0;
  const cost =
    ((tokensIn ?? 0) / 1_000_000) * pricing.inputPerMillion +
    ((tokensOut ?? 0) / 1_000_000) * pricing.outputPerMillion;
  // Redondeo a 6 decimales: una llamada individual cuesta fracciones de céntimo.
  return Math.round(cost * 1e6) / 1e6;
}
