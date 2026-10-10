/**
 * Next.js instrumentation — se ejecuta una vez por instancia de servidor
 * (runtime nodejs) antes de aceptar peticiones.
 *
 * Punto de entrada de la validación de variables de entorno que antes solo
 * existía en su test: si falta una variable requerida o tiene formato
 * inválido, el servidor NO arranca (fail-fast) en lugar de operar con
 * `undefined` silenciosos.
 *
 * Además instala el sink de errores `app_logs` (ADR-007) en producción y
 * exporta el hook `onRequestError` para persistir los 500 no capturados.
 */

import { validateEnv } from "@/env";
import { logger } from "@/lib/logger";
import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  // Nunca durante `next build` (CI/Vercel no tienen secrets en fase de build).
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // C4: inicializa Sentry en cada runtime. Antes este archivo NUNCA importaba
  // `sentry.server.config`, así que `Sentry.init()` no se ejecutaba en el
  // servidor y los errores de runtime Node no llegaban a Sentry. El DSN es
  // opcional (`enabled: Boolean(dsn)`): sin él el SDK queda inactivo y la app
  // arranca igual.
  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await import("../sentry.server.config");
    } else if (process.env.NEXT_RUNTIME === "edge") {
      await import("../sentry.edge.config");
    }
  } catch (error) {
    logger.error("No se pudo inicializar Sentry — continúa sin observabilidad externa", {
      module: "instrumentation",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Solo runtime Node: el proxy corre en edge y no necesita estas variables.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    validateEnv();
  } catch (error) {
    logger.error("Validación de variables de entorno fallida — abortando arranque", {
      module: "instrumentation",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (process.env.NODE_ENV === "production") {
    try {
      const { installErrorSink } = await import("./server/observability/app-logs-sink");
      installErrorSink();
    } catch (error) {
      logger.error("No se pudo instalar el sink de app_logs — continúa sin él", {
        module: "instrumentation",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Hook `onRequestError` de Next.js: errores de servidor no capturados que el
 * framework convierte en respuestas 500. Los persiste en `app_logs` (ADR-007)
 * en producción; nunca puede interferir con el manejo de errores de Next.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // C4: Sentry — `captureRequestError` es el punto de captura recomendado por
  // el SDK de Next.js. Se ejecuta en cualquier runtime (el SDK ya está
  // inicializado por `register()`). Fail-open: nunca interfiere con Next.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(error, request, context);
  } catch {
    // Sin DSN o sin red: se ignora.
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  try {
    const { captureRequestError } = await import("./server/observability/app-logs-sink");
    await captureRequestError(error, request, context);
  } catch {
    // Fail-open: cualquier fallo del sink se descarta sin afectar a Next.
  }
};
