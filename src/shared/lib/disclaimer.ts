/* ═══════════════════════════════════════════════════════════════════════
   Disclaimer gate — contrato compartido entre proxy (edge) y server action.

   Sin imports de Node ni de Next: este módulo lo consume `src/proxy.ts`
   (runtime edge) y `src/app/disclaimer/actions.ts` (runtime node), así que
   cualquier dependencia de servidor rompería el bundle del proxy.
   ═══════════════════════════════════════════════════════════════════════ */

/** Cookie que marca la aceptación del aviso legal. La lee el proxy. */
export const DISCLAIMER_COOKIE = "disclaimer_accepted";

/** 30 días, en segundos. */
export const DISCLAIMER_MAX_AGE = 60 * 60 * 24 * 30;

/** Destino por defecto tras aceptar cuando no hay `?redirect=` válido. */
export const DISCLAIMER_DEFAULT_REDIRECT = "/login";

/**
 * Rutas que NO exigen la cookie de disclaimer.
 *
 * `/login` no aparece a propósito: el aviso es una barrera ANTES del login.
 *
 * - `/auth`: callbacks de Supabase (OAuth / magic link). Un enlace abierto en
 *   un navegador sin cookie debe poder completar el flujo; el callback sin
 *   código termina en `/login`, que sí pasa por el gate.
 * - `/api`, `/_next`: peticiones de datos y assets del runtime.
 * - `/monitoring`: túnel de Sentry (`next.config.ts` → `tunnelRoute`).
 *   Redirigirlo convertiría cada envelope en un HTML y perdería errores.
 * - `/sw.js`, `/manifest.json`: service worker y manifiesto PWA; un redirect
 *   a HTML rompería el registro del worker.
 * - `/scripts`, `/vendor`: assets estáticos del BEACON RUM (`vitals.js`,
 *   `web-vitals.iife.js`). Los carga el sitio del CLIENTE como subresource
 *   cross-origin: una cookie SameSite=Lax del interstitial jamás viaja en ese
 *   GET, así que el redirect a HTML rompería el RUM para 100% de visitantes
 *   (incluido el self-RUM de scaudit.vercel.app sin cookie). Fix 2026-10-20.
 */
const PUBLIC_PATHS = [
  "/disclaimer",
  "/auth",
  "/api",
  "/_next",
  "/monitoring",
  "/sw.js",
  "/manifest.json",
  "/favicon.ico",
  "/health",
  "/status",
  "/scripts",
  "/vendor",
] as const;

/** `true` si `pathname` (o cualquier subruta) está exento del gate. */
export function isDisclaimerPublicPath(pathname: string): boolean {
  // Normaliza la barra final: `/api/` y `/api` son la misma ruta.
  const path = pathname.replace(/\/+$/, "") || "/";

  return PUBLIC_PATHS.some(
    (base) => path === base || path.startsWith(`${base}/`)
  );
}

/**
 * Devuelve `candidate` sólo si es una ruta interna segura; si no, `null`.
 *
 * Bloquea `//evil.com` (protocol-relative), `/\evil.com`, URLs absolutas y
 * caracteres de control (que permiten partir la cabecera `Location`).
 */
export function sanitizeRedirect(candidate: string | null | undefined): string | null {
  if (!candidate) return null;

  const value = candidate.trim();
  if (value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith("/")) return null;
  // `//host` y `/\host` son interpretados como host por los navegadores.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // CR/LF/tab permiten header injection en `Location`.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  return value;
}

/** Destino final tras aceptar: ruta interna válida o `/login`. */
export function resolveRedirectTarget(candidate: string | null | undefined): string {
  return sanitizeRedirect(candidate) ?? DISCLAIMER_DEFAULT_REDIRECT;
}
