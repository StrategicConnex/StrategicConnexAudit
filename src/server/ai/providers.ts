import { envSecrets } from "@/shared/config/env-secrets";
import type { AIMessage } from "./ai-router";

/**
 * providers.ts — Abstracción multi-proveedor (P2-1).
 *
 * OpenRouter sigue siendo el primario (pool :free + tools + JSON schema).
 * Anthropic directo es el failover para texto libre cuando la cadena
 * OpenRouter se agota Y hay ANTHROPIC_API_KEY configurada. Sin key, el
 * comportamiento es idéntico al anterior (failover interno OpenRouter).
 */

export type ProviderId = "openrouter" | "anthropic";

export interface ProviderTextRequest {
  model: string;
  messages: AIMessage[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface ProviderTextResult {
  content: string | null;
  modelUsed: string;
  /** Usage del proveedor (Sprint 1, idea #17); null si no lo reporta. */
  usage?: { tokensIn: number | null; tokensOut: number | null } | null;
}

/** Modelo barato por defecto; sobreescribible con ANTHROPIC_MODEL. */
export function anthropicDefaultModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022";
}

export function isAnthropicConfigured(): boolean {
  return !!envSecrets.anthropicApiKey;
}

function splitSystem(messages: AIMessage[]): { system: string; rest: Array<{ role: "user" | "assistant"; content: string }> } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // Anthropic exige alternancia user/assistant y primer mensaje user.
  const fixed: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of rest) {
    if (fixed.length === 0 && m.role !== "user") continue;
    const prev = fixed[fixed.length - 1];
    if (prev && prev.role === m.role) {
      prev.content += "\n\n" + m.content;
    } else {
      fixed.push({ ...m });
    }
  }
  if (fixed.length === 0) fixed.push({ role: "user", content: "(sin contenido)" });
  return { system, rest: fixed };
}

/**
 * Llamada de texto libre a Anthropic Messages API. Sin tools ni JSON schema
 * (el caller solo la usa para texto libre); cualquier fallo lanza.
 */
export async function callAnthropicText(req: ProviderTextRequest): Promise<ProviderTextResult> {
  const apiKey = envSecrets.anthropicApiKey;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }
  const { system, rest } = splitSystem(req.messages);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(system ? { system } : {}),
      messages: rest,
    }),
    signal: AbortSignal.timeout(req.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status} para ${req.model}: ${text.slice(0, 150)}`);
  }

  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((b: { type?: string }) => b?.type === "text")
        .map((b: { text?: string }) => b.text ?? "")
        .join("")
    : "";
  if (!text) {
    throw new Error(`Respuesta vacía de Anthropic (${req.model})`);
  }
  const usage = data?.usage
    ? {
        tokensIn: typeof data.usage.input_tokens === "number" ? data.usage.input_tokens : null,
        tokensOut: typeof data.usage.output_tokens === "number" ? data.usage.output_tokens : null,
      }
    : null;
  return { content: text, modelUsed: `anthropic/${req.model}`, usage };
}
