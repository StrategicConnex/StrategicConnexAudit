/**
 * Shared Constants — StrategicAudit Pro
 * 
 * Centraliza magic numbers para timeouts, límites y configuración.
 */

// ─── Timeouts ────────────────────────────────────────────────────────────────
/** Tiempo de espera para peticiones HTTP externas (10s) */
export const FETCH_TIMEOUT_MS = 10_000;

/** Tiempo de espera para peticiones pesadas (30s) */
export const HEAVY_FETCH_TIMEOUT_MS = 30_000;

/** Duración del toast "Copiado" (2s) */
export const CLIPBOARD_TOAST_MS = 2_000;

/** Duración del toast de éxito (3s) */
export const SUCCESS_TOAST_MS = 3_000;

/** Tiempo de simulación de sincronización (1.2s) */
export const SYNC_SIMULATION_MS = 1_200;

// ─── Pagination ──────────────────────────────────────────────────────────────
/** Límite por defecto para listas de investigaciones */
export const INVESTIGATIONS_PAGE_SIZE = 50;

/** Límite por defecto para hallazgos */
export const FINDINGS_PAGE_SIZE = 500;

/** Límite por defecto para activos */
export const ASSETS_PAGE_SIZE = 100;

/** Límite por defecto para eventos */
export const EVENTS_PAGE_SIZE = 500;

// ─── Security ────────────────────────────────────────────────────────────────
/** Número máximo de intentos de login */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Bloqueo temporal tras intentos fallidos (minutos) */
export const LOGIN_LOCKOUT_MINUTES = 15;
