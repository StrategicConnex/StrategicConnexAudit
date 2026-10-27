/**
 * Contratos compartidos del chat (servidor ↔ cliente).
 *
 * `references` solo contiene hallazgos que el servidor resolvió bajo RLS; el
 * cliente nunca construye una referencia por su cuenta.
 */

export interface ChatReference {
  id: string;
  title: string;
}

export interface ChatSuggestion {
  /** hash(sorted(findingIds) + ventana): identifica el conjunto sugerido. */
  fingerprint: string;
  findingIds: string[];
  /** Investigación real a la que apunta el CTA (null si no hay ninguna). */
  investigationId: string | null;
  /** Plantilla ya localizada en servidor; nunca la genera el modelo. */
  text: string;
  ctaLabel: string;
}
