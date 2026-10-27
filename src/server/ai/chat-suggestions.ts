/**
 * chat-suggestions.ts — sugerencia proactiva anti-nag.
 *
 * La decisión y el texto son server-side: el modelo no redacta la sugerencia.
 * Solo se sugiere cuando hay hallazgos críticos dentro de la ventana de 7 días
 * y existe una investigación real a la que apuntar el CTA.
 */

import { createHash } from "node:crypto";
import { createTranslator } from "next-intl";
import type { ChatSuggestion } from "@/shared/types/chat";

export const SUGGESTION_WINDOW_DAYS = 7;

export interface SuggestionFinding {
  id: string;
  severity: string;
  createdAt: Date | string;
  investigationId?: string | null;
}

export interface BuildSuggestionInput {
  findings: ReadonlyArray<SuggestionFinding>;
  /** Investigación activa en la superficie, si la hay. */
  investigationId?: string | null;
  locale: string;
  /** Mensajes completos de next-intl (namespace `chat` incluido). */
  messages: Record<string, unknown>;
  now?: Date;
}

/**
 * Fingerprint estable por conjunto y ventana: hash(sorted(ids) + día de
 * inicio de la ventana). El mismo conjunto vuelve a sugerirse cuando la
 * ventana avanza, y un conjunto distinto nunca hereda el descarte.
 */
export function suggestionFingerprint(findingIds: readonly string[], windowStart: Date): string {
  const sorted = [...new Set(findingIds)].sort();
  const windowKey = windowStart.toISOString().slice(0, 10);
  return createHash("sha256").update(`${sorted.join(",")}|${windowKey}`).digest("hex").slice(0, 32);
}

/** Hallazgos críticos dentro de la ventana, ordenados por id (determinista). */
export function recentCriticalFindings(
  findings: ReadonlyArray<SuggestionFinding>,
  now: Date = new Date(),
): SuggestionFinding[] {
  const windowStart = new Date(now.getTime() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return findings
    .filter((finding) => {
      if (String(finding.severity).toLowerCase() !== "critical") return false;
      const createdAt = new Date(finding.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= windowStart && createdAt <= now;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Normaliza los hallazgos del contexto resuelto (que llegan como `unknown`)
 * al contrato mínimo de la sugerencia. Descarta cualquier forma inválida.
 */
export function toSuggestionFindings(value: unknown): SuggestionFinding[] {
  if (!Array.isArray(value)) return [];
  const out: SuggestionFinding[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const finding = raw as {
      id?: unknown;
      severity?: unknown;
      createdAt?: unknown;
      investigationId?: unknown;
    };
    if (typeof finding.id !== "string" || typeof finding.severity !== "string") continue;
    if (!(finding.createdAt instanceof Date) && typeof finding.createdAt !== "string") continue;
    out.push({
      id: finding.id,
      severity: finding.severity,
      createdAt: finding.createdAt,
      investigationId:
        typeof finding.investigationId === "string" ? finding.investigationId : null,
    });
  }

  return out;
}

export function buildCriticalSuggestion(input: BuildSuggestionInput): ChatSuggestion | null {
  const now = input.now ?? new Date();
  const critical = recentCriticalFindings(input.findings, now);
  if (critical.length === 0) return null;

  const investigationId =
    input.investigationId ?? critical.find((finding) => finding.investigationId)?.investigationId ?? null;
  // Sin investigación real no hay flujo de plan al que llevar el CTA.
  if (!investigationId) return null;

  const windowStart = new Date(now.getTime() - SUGGESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const findingIds = critical.map((finding) => finding.id);
  const translate = createTranslator({
    locale: input.locale,
    messages: input.messages,
    namespace: "chat",
  } as Parameters<typeof createTranslator>[0]) as unknown as (
    key: string,
    values?: Record<string, unknown>,
  ) => string;

  return {
    fingerprint: suggestionFingerprint(findingIds, windowStart),
    findingIds,
    investigationId,
    text: translate("suggestionText", { count: findingIds.length }),
    ctaLabel: translate("suggestionCta"),
  };
}
