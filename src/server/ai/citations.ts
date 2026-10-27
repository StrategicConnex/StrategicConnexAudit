/**
 * citations.ts — verificación de las citas que produce el modelo.
 *
 * El modelo solo puede citar hallazgos que el servidor ya resolvió bajo RLS.
 * Cualquier marcador que no corresponda a ese conjunto se degrada a texto
 * plano (nunca se convierte en enlace) y se cuenta para telemetría.
 */

import type { ChatReference } from "@/shared/types/chat";

export interface CitedFinding {
  id: string;
  title: string;
}

export interface ParsedCitations {
  /** Texto con los marcadores válidos normalizados a `[[ref:n]]`. */
  text: string;
  /** Hallazgos citados, en orden de primera aparición. */
  references: ChatReference[];
  /** Marcadores `[[finding:…]]` que no corresponden a un hallazgo permitido. */
  unverifiedCount: number;
}

/** Un marcador de cita: `[[finding:<id>]]`. El id vacío también es un intento. */
const FINDING_MARKER = /\[\[finding:([^\]\r\n]*)\]\]/g;

/**
 * Extrae los hallazgos citables de un contexto ya resuelto bajo RLS.
 * `selectedFinding` se añade al conjunto reciente; los duplicados se colapsan.
 */
export function toCitedFindings(context: Record<string, unknown> | null | undefined): CitedFinding[] {
  if (!context) return [];

  const out: CitedFinding[] = [];
  const seen = new Set<string>();
  const add = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const finding = value as { id?: unknown; title?: unknown };
    if (typeof finding.id !== "string" || typeof finding.title !== "string") return;
    if (!finding.id || seen.has(finding.id)) return;
    seen.add(finding.id);
    out.push({ id: finding.id, title: finding.title });
  };

  if (Array.isArray(context["findings"])) {
    for (const finding of context["findings"]) add(finding);
  }
  add(context["selectedFinding"]);

  return out;
}

/**
 * Coteja los marcadores del modelo contra el conjunto validado server-side.
 * Los ids válidos se renumeran a `[[ref:n]]` (1-based) para que el cliente no
 * tenga que confiar en texto arbitrario del modelo. Los inválidos se dejan
 * tal cual: el cliente los pinta como texto plano.
 */
export function parseCitations(
  text: string,
  allowedFindings: ReadonlyArray<CitedFinding>,
): ParsedCitations {
  const allowed = new Map<string, CitedFinding>();
  for (const finding of allowedFindings) {
    if (!finding?.id || allowed.has(finding.id)) continue;
    allowed.set(finding.id, finding);
  }

  // Solo se referencia lo que el modelo citó de verdad, en orden de aparición.
  const references: ChatReference[] = [];
  const cited = new Map<string, number>(); // id → índice 1-based
  let unverifiedCount = 0;

  const rewritten = text.replace(FINDING_MARKER, (raw, rawId: string) => {
    const id = rawId.trim();
    const finding = allowed.get(id);
    if (!finding) {
      unverifiedCount += 1;
      return raw;
    }

    let index = cited.get(id);
    if (index === undefined) {
      references.push({ id: finding.id, title: finding.title });
      index = references.length;
      cited.set(id, index);
    }
    return `[[ref:${index}]]`;
  });

  return { text: rewritten, references, unverifiedCount };
}
