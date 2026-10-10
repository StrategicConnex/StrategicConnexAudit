/**
 * flags.ts — Feature flags mínimos por entorno (A5 / ROLL-001).
 *
 * Objetivo: poder activar un cambio de alto riesgo sin desplegar y hacer
 * canary progresivo, cerrando el gap ROLL-001 del v4-audit. Sin dependencias
 * ni panel: el estado vive en variables de entorno.
 *
 * Convención:
 *   FEATURE_<NAME>            on/off explícito (1/true/on/yes · 0/false/off/no)
 *   FEATURE_<NAME>_ROLLOUT    porcentaje 0..100 (canary por usuario)
 *
 * El nombre de flag se normaliza a SCREAMING_SNAKE_CASE (p. ej. `scanQueue`
 * → `FEATURE_SCAN_QUEUE`). Precedencia: explícito > rollout > apagado.
 *
 * El bucket de canary es un hash FNV-1a estable de `name:userId`, de modo que
 * el mismo usuario ve la misma decisión en todas las instancias (sin estado).
 */

export const FLAG_ENV_PREFIX = "FEATURE_";

/**
 * Prefijo que Next.js deja llegar al bundle del navegador. Un `process.env.FEATURE_X`
 * sin este prefijo se sustituye por `undefined` al compilar el cliente, con lo que un
 * flag leído desde un componente "use client" sería SIEMPRE false y el cambio que
 * gobierna nunca se activaría.
 */
export const FLAG_PUBLIC_ENV_PREFIX = "NEXT_PUBLIC_FEATURE_";

/**
 * Lee el valor de un flag en el runtime actual.
 *
 * Orden: primero la clave desnuda, que es lo que se usa en el servidor y en los
 * tests; si no existe y estamos en el navegador, la variante `NEXT_PUBLIC_`. Ese
 * orden hace que **ningún comportamiento existente cambie**: en el servidor la
 * clave desnuda siempre resuelve y el prefijo público nunca se consulta.
 *
 * Fail-closed se mantiene: si no hay ninguna de las dos, el flag está apagado.
 */
function readFlagEnv(key: string): string | undefined {
  const direct = process.env[key];
  if (direct != null) return direct;
  if (typeof window === "undefined") return undefined;
  return process.env[FLAG_PUBLIC_ENV_PREFIX + key.slice(FLAG_ENV_PREFIX.length)];
}

/** `scanQueue` → `FEATURE_SCAN_QUEUE`. Expuesto para tests y para docs. */
export function flagEnvKey(name: string): string {
  const snake = name
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
  return `${FLAG_ENV_PREFIX}${snake}`;
}

const TRUTHY = new Set(["1", "true", "on", "yes", "enabled"]);
const FALSY = new Set(["0", "false", "off", "no", "disabled"]);

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return undefined;
}

/** Hash FNV-1a 32-bit estable → cubo 0..buckets-1. */
export function stableBucket(key: string, buckets = 100): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % buckets;
}

export interface FlagContext {
  /** Identificador estable para el canary (user.id); sin él, "anonymous". */
  userId?: string | null;
}

/**
 * ¿Está activo el flag `name`? Apagado por defecto (fail-closed): un flag no
 * declarado nunca enciende un cambio de alto riesgo por accidente.
 */
export function isFlagEnabled(name: string, ctx: FlagContext = {}): boolean {
  const base = flagEnvKey(name);

  const explicit = parseBool(readFlagEnv(base));
  if (explicit !== undefined) return explicit;

  const rolloutRaw = readFlagEnv(`${base}_ROLLOUT`);
  if (rolloutRaw != null) {
    const pct = Number.parseFloat(rolloutRaw);
    if (Number.isFinite(pct) && pct > 0) {
      if (pct >= 100) return true;
      const key = `${name}:${ctx.userId ?? "anonymous"}`;
      return stableBucket(key) < pct;
    }
  }

  return false;
}

/** Lista de todos los flags declarados (útil para un endpoint de diagnóstico). */
export function listDeclaredFlags(): Array<{ name: string; envKey: string; enabled: boolean }> {
  const out: Array<{ name: string; envKey: string; enabled: boolean }> = [];
  const vistos = new Set<string>();
  for (const [key, value] of Object.entries(process.env)) {
    // Los públicos se listan con el nombre sin prefijo, que es el que se usa para
    // consultarlos; el envKey que se devuelve es el que realmente está definido.
    const esPublico = key.startsWith(FLAG_PUBLIC_ENV_PREFIX);
    const esPrivado = key.startsWith(FLAG_ENV_PREFIX) && !key.endsWith("_ROLLOUT");
    if (!esPublico && !esPrivado) continue;
    if (value == null) continue;
    const prefijo = esPublico ? FLAG_PUBLIC_ENV_PREFIX : FLAG_ENV_PREFIX;
    const name = key.slice(prefijo.length);
    if (vistos.has(name)) continue;
    vistos.add(name);
    out.push({ name, envKey: key, enabled: isFlagEnabled(name) });
  }
  return out.sort((a, b) => a.envKey.localeCompare(b.envKey));
}
