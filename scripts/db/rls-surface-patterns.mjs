/**
 * rls-surface-patterns.mjs — patrón y conteo léxico de la superficie que accede
 * a datos fuera de `withRLS()` (P0.2).
 *
 * Vive aparte porque lo consumen DOS herramientas que deben coincidir siempre:
 * `rls-surface-guard.mjs` (el gate de CI) y `rls-surface-report.mjs` (el informe
 * que alimenta el baseline/allowlist). Tener dos copias del regex invita a que
 * una se corrija y la otra no — y ese desacuerdo sería silencioso.
 *
 * EL `\s*` NO ES COSMÉTICO (hallazgo 2026-10-13): el código de este repo escribe
 * con frecuencia
 *     await directDb
 *       .select()...
 * Con `directDb\.` a secas, esas llamadas no existían para el conteo: 190 de las
 * 330 reales eran invisibles (160 `directDb` + 30 `db`) en 59 archivos. Peor que
 * un número bajo: un sitio NUEVO escrito así no rompía el gate, que es justo lo
 * que el gate promete impedir.
 */

import fs from "node:fs";
import path from "node:path";

/** `directDb.<método>` — el lookbehind evita coincidir con `otroDirectDb.`. */
export const RE_DIRECT = /(?<![\w.])directDb\s*\.(query|insert|update|delete|select|execute|transaction|\$count)/g;
/** `db.<método>` crudo — excluye `directDb.`/`lazyDb.`/`getDb.` por el lookbehind. */
export const RE_BARE = /(?<![\w.$])db\s*\.(query|insert|update|delete|select|execute|transaction)/g;

/** Ficheros de app: .ts/.tsx, ignorando tests y node_modules. */
export function* walkSourceFiles(srcDir, rootDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const abs = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walkSourceFiles(abs, rootDir);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield { abs, rel: path.relative(rootDir, abs).split(path.sep).join("/") };
    }
  }
}

export const lineOf = (src, index) => src.slice(0, index).split(/\r?\n/).length;

/**
 * Conteo por archivo (con las líneas de cada llamada) y totales del árbol.
 * `srcDir` suele ser `<root>/src`; `rootDir` es la raíz del repo (para las rutas
 * relativas que se guardan en el baseline).
 */
/**
 * Compara el baseline congelado con lo medido y devuelve SOLO las discrepancias.
 *
 * Existe por el agujero del 2026-10-13: el gate iteraba los archivos MEDIDOS, así
 * que un archivo que bajaba a CERO llamadas desaparecía del conteo y no generaba
 * ninguna discrepancia —el baseline quedaba por encima del árbol y el gate decía
 * «OK» con totales que ya no cuadraban—. Aquí los archivos del baseline ausentes
 * del conteo se reportan como `vacio`, que es exactamente la reducción a 0 que el
 * propio guard exige consolidar con `--snapshot` en el commit de la migración.
 *
 * `archivos` viene de `countSurface` reducido a conteos: { archivo, directDb,
 * dbSinEnvolver }. Cada discrepancia: { archivo, tipo: nuevo|cambio|vacio, antes,
 * ahora, delta }.
 */
export function diffBaseline(baseline, archivos) {
  const medidos = new Set(archivos.map((a) => a.archivo));
  const discrepancias = [];

  for (const a of archivos) {
    const ahora = { directDb: a.directDb, dbSinEnvolver: a.dbSinEnvolver };
    const bl = baseline[a.archivo];
    if (bl == null) {
      discrepancias.push({ archivo: a.archivo, tipo: "nuevo", antes: null, ahora, delta: null });
      continue;
    }
    const delta = { directDb: ahora.directDb - bl.directDb, dbSinEnvolver: ahora.dbSinEnvolver - bl.dbSinEnvolver };
    if (delta.directDb !== 0 || delta.dbSinEnvolver !== 0) {
      discrepancias.push({ archivo: a.archivo, tipo: "cambio", antes: bl, ahora, delta });
    }
  }

  for (const [archivo, bl] of Object.entries(baseline)) {
    if (medidos.has(archivo)) continue;
    discrepancias.push({
      archivo,
      tipo: "vacio",
      antes: bl,
      ahora: { directDb: 0, dbSinEnvolver: 0 },
      delta: { directDb: 0 - bl.directDb, dbSinEnvolver: 0 - bl.dbSinEnvolver },
    });
  }

  return discrepancias;
}

/**
 * Formatea una discrepancia para el reporte del gate. `mejora` marca las bajadas
 * (incluida la desaparición del archivo): son cambios igual de reales que un
 * aumento y también exigen re-congelar el baseline.
 */
export function formatDiscrepancy(d) {
  if (d.tipo === "nuevo") {
    return `ARCHIVO NUEVO (sin baseline): ${d.archivo} [directDb:${d.ahora.directDb} db:${d.ahora.dbSinEnvolver}]`;
  }
  const fmt = (n) => (n > 0 ? `+${n}` : String(n));
  const mejora = d.delta.directDb < 0 || d.delta.dbSinEnvolver < 0;
  return `CAMBIO en archivo: ${d.archivo} [antes ${d.antes.directDb}/${d.antes.dbSinEnvolver} → ahora ${d.ahora.directDb}/${d.ahora.dbSinEnvolver} (Δ ${fmt(d.delta.directDb)} / ${fmt(d.delta.dbSinEnvolver)})]${mejora ? "  ← mejora: re-congela con --snapshot en este commit" : ""}`;
}

export function countSurface(srcDir, rootDir) {
  const archivos = [];
  for (const { abs, rel } of walkSourceFiles(srcDir, rootDir)) {
    const src = fs.readFileSync(abs, "utf8");
    const directas = [...src.matchAll(RE_DIRECT)].map((m) => lineOf(src, m.index));
    const crudas = [...src.matchAll(RE_BARE)].map((m) => lineOf(src, m.index));
    if (directas.length === 0 && crudas.length === 0) continue;
    archivos.push({
      archivo: rel,
      directDb: directas,
      dbSinEnvolver: crudas,
      usaWithRLS: /\bwithRLS\b/.test(src),
    });
  }
  const totales = archivos.reduce(
    (acc, a) => ({
      directDb: acc.directDb + a.directDb.length,
      dbSinEnvolver: acc.dbSinEnvolver + a.dbSinEnvolver.length,
    }),
    { directDb: 0, dbSinEnvolver: 0 },
  );
  return { archivos, totales };
}
