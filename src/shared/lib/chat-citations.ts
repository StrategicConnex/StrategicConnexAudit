/**
 * chat-citations.ts — parseo de los tokens de cita ya verificados.
 *
 * El servidor renumera los marcadores válidos a `[[ref:n]]`; el cliente solo
 * convierte en enlace los que apuntan a una referencia existente. Cualquier
 * otro token (por ejemplo `[[ref:9]]` sin referencia 9) se pinta como texto.
 */

export type CitationSegment =
  | { type: "text"; value: string }
  | { type: "reference"; index: number; raw: string };

const REFERENCE_TOKEN = /\[\[ref:(\d+)\]\]/g;

/** Divide un texto en tramos de texto y tokens `[[ref:n]]`. */
export function splitCitationTokens(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(REFERENCE_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, start) });
    }
    segments.push({
      type: "reference",
      index: Number.parseInt(match[1] ?? "0", 10),
      raw: match[0],
    });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }

  return segments;
}

/** URL del hallazgo citado dentro de la superficie de Intelligence. */
export function citationHref(findingId: string): string {
  const id = encodeURIComponent(findingId);
  return `/intelligence?evidence=${id}#finding-${id}`;
}
