/**
 * types.ts — Tipos del motor de Evaluación Real de Adversarios.
 *
 * Cada check es una prueba NO destructiva contra el dominio autorizado del
 * proyecto que produce evidencia estructurada. La evidencia cruda alimenta
 * al agente AI analista (OpenRouter) que clasifica vulnerabilidades.
 */

import type { SafeFetch } from "../../security/egress-guard";

export interface CheckContext {
  /** Hostname desnudo (sin scheme). */
  host: string;
  /** Origen base: https://host */
  origin: string;
  /** fetch con egress-guard obligatorio. */
  fetch: SafeFetch;
  timeoutMs: number;
}

export type CheckSeverity = "info" | "low" | "medium" | "high" | "critical";
export type CheckStatus = "pass" | "finding" | "error" | "skipped";

export interface CheckEvidence {
  [key: string]: unknown;
}

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  /** Severidad del hallazgo (solo cuando status === "finding"). */
  severity?: CheckSeverity;
  summary: string;
  evidence: CheckEvidence;
}

export interface CheckDefinition {
  id: string;
  name: string;
  category: "tls" | "headers" | "exposure" | "webconfig" | "content";
  description: string;
  run: (ctx: CheckContext) => Promise<CheckResult>;
}

/** Resultado agregado de la fase de ejecución (pre-AI). */
export interface AssessmentEvidence {
  target: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  checks: CheckResult[];
}

export const CHECK_CATEGORIES = ["tls", "headers", "exposure", "webconfig", "content"] as const;
