/**
 * Valida el parámetro `next` de los callbacks de auth contra open-redirect.
 *
 * Regla: solo se permiten rutas relativas del propio sitio. Se bloquean:
 * - URLs externas (`https://evil.com`, `mailto:...`, `//evil.com` protocol-relative)
 * - Cualquier valor que no empiece por `/` (dominios, schemes, malformados)
 *
 * Devuelve la ruta saneada o `/` si el valor es inválido.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  const trimmed = next.trim();
  // Backslash se normaliza a "/" en varios navegadores: "/\\evil.com"
  // puede interpretarse como "//evil.com" (protocol-relative). Bloquear
  // cualquier ruta que lo contenga tras normalización o al inicio.
  if (trimmed.includes("\\")) return "/";
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed : "/";
}
