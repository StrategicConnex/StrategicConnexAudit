/**
 * Formateo de fecha y número con locale y zona FIJOS.
 *
 * Por qué no `toLocale*()` a pelo: con la lista de locales vacía (`[]` o sin
 * argumentos) cada runtime elige el suyo. Node suele ir a UTC y el navegador
 * usa la zona del usuario, así que el HTML que sale del servidor no coincide
 * con el que React genera en el cliente y Next tira el árbol entero a render
 * en cliente con "Hydration failed because the server rendered text didn't
 * match the client". Con una hora de diferencia entre CI (UTC) y un portátil
 * en UTC+2 el fallo es intermitente, que es la peor forma de que se manifieste.
 *
 * Convención del proyecto: `es-ES` y UTC en todas partes, igual que
 * `formatEventTime` en `src/components/ActivityTimeline.tsx`, que ya lleva el
 * mismo comentario. Aquí se centraliza para que los ~12 call sites de cliente
 * no repetan el `Intl` inline.
 */

/** Locale único del producto. Los numbers y fechas se muestran en español. */
const LOCALE = "es-ES";

/** Zona única. Evita el salto de UTC a la zona local entre servidor y cliente. */
const TIME_ZONE = "UTC";

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * `14:35` — hora corta. Para ejes de gráficas y listas densas.
 */
export function formatTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * `14:35:07` — hora con segundos. Para logs de actividad donde el orden
 * dentro del mismo minuto importa.
 */
export function formatTimeWithSeconds(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * `14 mar 2026` — fecha corta sin hora.
 */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * `14 mar 2026, 14:35` — fecha y hora, para "actualizado el ...".
 */
export function formatDateTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(toDate(value));
}

/**
 * `1.234` — separador de miles español. Para contadores y cuotas.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}