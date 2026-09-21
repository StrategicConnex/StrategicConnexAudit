/**
 * app-url.ts — URL absoluta base para links SALIENTES (portal cliente,
 * invitaciones por email, notificaciones). Server y client-safe (solo lee
 * NEXT_PUBLIC_* en cliente; VERCEL_* solo existen en server).
 *
 * Precedencia:
 *  1. NEXT_PUBLIC_APP_URL explícita (la que el operador declara pública).
 *  2. VERCEL_PROJECT_PRODUCTION_URL — dominio ESTABLE de producción que
 *     Vercel inyecta (el alias de producción, ej. scaudit.vercel.app), no
 *     cambia con cada deploy.
 *  3. VERCEL_URL — dominio del deployment concreto. Puede tener Vercel
 *     Authentication (SSO) activo: los links mostrarían un login de Vercel
 *     al cliente. Por eso va después del dominio de producción.
 *  4. localhost (desarrollo).
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/\/+$/, "")}`;

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
