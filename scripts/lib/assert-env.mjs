/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guarda de entorno para scripts de mantenimiento y e2e (Fase 2).

   POR QUÉ EXISTE (Fase 1, purga de 4 515 filas del 2026-10-11): los scripts
   de prueba (`src/shared/db/seed.ts`, los e2e de IA/adversario, los de RLS y
   `post-rls-check.mjs`) escriben usuarios y proyectos de prueba con el rol de
   servicio, sin ninguna barrera de entorno. Ejecutar uno por accidente contra
   la base compartida vuelve a inyectar exactamente la basura que acabamos de
   purgar. Esta guarda corta la generación en el punto de entrada.

   REGLA: ningún script marcado `assertNotProd` escribe en producción salvo con
   `--allow-prod` explícito; y la limpieza de lo que crea es ON por defecto
   (opt-out sólo con `--no-cleanup`, que a su vez exige `--allow-prod`).

   Detección de "producción" (en este orden):
     1. `APP_ENV`, `VERCEL_ENV` o `NODE_ENV` valen `production`/`prod`.
     2. el DSN/URL apunta a un marcador de producción conocido
        (`scaudit.vercel.app`) — cubre el caso del script que decide su
        destino a partir de la URL y no de una variable de entorno.
   ═══════════════════════════════════════════════════════════════════════ */

/** Marcadores de producción dentro de una URL/DSN. */
const PROD_MARKERS = ["scaudit.vercel.app"];

/** Valores de entorno que significan "esto es producción". */
const PROD_ENV_VALUES = new Set(["production", "prod"]);

/**
 * ¿El entorno/URL actual es producción?
 *
 * @param {{ url?: string }} [opts] URL adicional a inspeccionar (para scripts
 *   cuyo destino es un argumento, no una variable de entorno).
 * @returns {"production" | "development"}
 */
export function targetFromEnv(opts = {}) {
  const envSignals = [process.env.APP_ENV, process.env.VERCEL_ENV, process.env.NODE_ENV];
  for (const signal of envSignals) {
    if (signal && PROD_ENV_VALUES.has(signal.toLowerCase())) return "production";
  }

  const raw =
    opts.url ??
    process.env.DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  return PROD_MARKERS.some((marker) => raw.includes(marker)) ? "production" : "development";
}

/**
 * Aborta si el script apunta a producción sin `--allow-prod`.
 *
 * @param {string} label Nombre legible del script (para el mensaje).
 * @param {{ allowFlag?: string, url?: string }} [opts]
 * @returns {"production" | "development"} el target detectado (nunca lanza si pasa).
 */
export function assertNotProd(label, opts = {}) {
  const allowFlag = opts.allowFlag ?? "--allow-prod";
  const target = targetFromEnv(opts);
  if (target === "production" && !process.argv.includes(allowFlag)) {
    throw new Error(
      `[assert-not-prod] "${label}" intenta correr contra PRODUCCIÓN.\n` +
        `  La generación de datos de prueba está bloqueada en producción.\n` +
        `  Este script escribe usuarios/proyectos de prueba en la base de datos real.\n` +
        `  Si de verdad necesitas ejecutarlo ahí, relánzalo con ${allowFlag} y un plan de limpieza.`
    );
  }
  return target;
}

/**
 * ¿Debe limpiar el script lo que crea? ON por defecto.
 * Pasar `--no-cleanup` sólo se permite con `--allow-prod` (si no, se aborta):
 * dejar residuos de prueba en la BD es justo lo que la Fase 2 quiere evitar.
 *
 * @param {string} label
 * @param {{ defaultCleanup?: boolean }} [opts]
 * @returns {boolean} true ⇒ hay que limpiar al terminar.
 */
export function assertCleanupPlan(label, opts = {}) {
  const defaultCleanup = opts.defaultCleanup ?? true;
  const wantsNoCleanup = process.argv.includes("--no-cleanup");
  if (wantsNoCleanup && !process.argv.includes("--allow-prod")) {
    throw new Error(
      `[assert-cleanup-plan] "${label}": --no-cleanup sólo se permite junto a --allow-prod.\n` +
        `  Por defecto los scripts limpian lo que crean; no dejes filas de prueba en la BD.`
    );
  }
  if (wantsNoCleanup) return false;
  return defaultCleanup;
}
