/**
 * ai-cost.ts — Coste estimado por llamada IA (Sprint 1, idea #17 del roadmap).
 *
 * Los modelos del pool son :free (coste 0), pero el pool también enruta a
 * Anthropic directo como failover inter-proveedor (P2-1). Para tener una
 * métrica de coste única transversal:
 *
 *   - Modelos `:free` y `openrouter/free` → coste 0 (el coste real es el
 *     rate limit diario, no dinero)
 *   - Failover Anthropic → coste estimado según su tabla de precios pública
 *   - Modelos de pago futuros → añadir entrada a COST_TABLE_USD
 *
 * El estimado se registra por llamada en `ai_usage.cost_usd` y el dashboard
 * /ai/health lo agrega por task type. Es una ESTIMACIÓN: los precios pueden
 * cambiar; nunca usar para facturación real.
 */

/** Precio USD por millón de tokens (in / out). */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Tabla de precios (USD / 1M tokens) de los proveedores NO gratuitos que
 * el router puede usar. Los `:free` no aparecen: estimateCostUsd los trata
 * como 0 sin necesidad de entrada.
 */
export const COST_TABLE_USD: Record<string, ModelPricing> = {
  // Anthropic Messages API (precios públicos 2026; failover P2-1)
  "anthropic/claude-3-5-haiku-20241022": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "anthropic/claude-3-5-sonnet-20241022": { inputPerMillion: 3, outputPerMillion: 15 },
  "anthropic/claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
};

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
export function estimateCostUsd(modelUsed: string, tokensIn: number | null | undefined, tokensOut: number | null | undefined): number {
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
