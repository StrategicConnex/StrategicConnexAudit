/**
 * Sets a browser cookie with the given name, value, and expiry days.
 * Works in client-side (browser) context only.
 */
export function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Reads a browser cookie by name. Returns null if not found.
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  // OJO con el escape: en un template literal, `\s` se evalúa como "s" literal
  // (escape no válido → se pierde la barra). El doble escape `\\s` es OBLIGATORIO
  // para que RegExp reciba `\s` real. Con `\s` simple, getCookie fallaba para
  // cualquier cookie que NO fuera la primera de la cadena (bug detectado por tests).
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`)
  );

  return match ? decodeURIComponent(match[1]!) : null;
}
