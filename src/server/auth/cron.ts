/**
 * Autenticación de endpoints CRON (Vercel Cron / jobs programados).
 *
 * Reglas:
 * - Si CRON_SECRET está configurada, se exige SIEMPRE (producción, preview,
 *   staging). Antes los despliegues no-productivos quedaban abiertos y
 *   permitían disparar escaneos y quemar créditos de IA.
 * - Solo se permite invocar sin secreto en no-producción Y sin CRON_SECRET
 *   configurada (DX local / tests).
 * - En producción es FAIL-CLOSED: si CRON_SECRET no está configurada se
 *   rechaza siempre (antes un entorno mal configurado quedaba abierto).
 * - La comparación del header Authorization es timing-safe (hasheo previo,
 *   mismo patrón que cicd-helper.ts) para no filtrar información por timing.
 */

import crypto from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Gate completo para rutas exclusivas de cron (GET /api/cron/*). */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail-closed en producción; solo abierto en dev/test sin secreto (DX local).
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") ?? "";
  return safeEqual(authHeader, `Bearer ${secret}`);
}

/**
 * Modo dual (cron O usuario autenticado): comprueba solo si el header
 * coincide con CRON_SECRET. Usado por /api/security/siem/run|test donde
 * un usuario admin también puede disparar la exportación.
 */
export function isCronSecretMatched(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) {
    return false;
  }
  return safeEqual(authHeader, `Bearer ${secret}`);
}
