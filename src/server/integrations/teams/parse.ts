/**
 * parse.ts — Normalización de mensajes de Teams (Tanda 4 / B16).
 *
 * Teams entrega el texto como HTML ligero: las menciones al bot llegan como
 * `<at>SCAudit</at>` y los espacios como `&nbsp;`. El parser de comandos
 * espera texto plano, así que la limpieza vive aquí (pura y testeable).
 */

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function stripTeamsMentions(text: string): string {
  const withoutTags = (text ?? "").replace(/<at\b[^>]*>.*?<\/at>/gi, " ");
  const withoutEntities = withoutTags.replace(
    /&(nbsp|amp|lt|gt|quot|#39);/g,
    (match) => HTML_ENTITIES[match] ?? match,
  );
  return withoutEntities.replace(/\s+/g, " ").trim();
}
