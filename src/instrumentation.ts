/**
 * Next.js instrumentation — se ejecuta una vez por instancia de servidor
 * (runtime nodejs) antes de aceptar peticiones.
 *
 * Punto de entrada de la validación de variables de entorno que antes solo
 * existía en su test: si falta una variable requerida o tiene formato
 * inválido, el servidor NO arranca (fail-fast) en lugar de operar con
 * `undefined` silenciosos.
 */

import { validateEnv } from "@/env";
import { logger } from "@/lib/logger";

export async function register(): Promise<void> {
  // Solo runtime Node: el proxy corre en edge y no necesita estas variables.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Nunca durante `next build` (CI/Vercel no tienen secrets en fase de build).
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    validateEnv();
  } catch (error) {
    logger.error("Validación de variables de entorno fallida — abortando arranque", {
      module: "instrumentation",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
