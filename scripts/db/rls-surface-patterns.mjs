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
