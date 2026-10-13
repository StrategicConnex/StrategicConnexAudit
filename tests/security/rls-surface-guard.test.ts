// @vitest-environment node
/**
 * P0.2-A — El guard de superficie RLS debe VER lo que promete.
 *
 * Hallazgo (2026-10-13): el patrón exigía el punto pegado al identificador, así
 * que las llamadas escritas como
 *     await directDb
 *       .select(...)
 * —el estilo dominante en este repo— no se contaban: 190 de 330 reales eran
 * invisibles, y peor, un sitio NUEVO escrito así no habría roto el gate. Estos
 * casos fijan el patrón, y que guard e informe no puedan divergir.
 *
 * Los casos negativos usan fixtures en un directorio temporal: un guard que solo
 * dice «ok» no vale de nada (mismo criterio que rls-inventory.test.ts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countSurface,
  diffBaseline,
  formatDiscrepancy,
} from "../../scripts/db/rls-surface-patterns.mjs";

const ROOT = process.cwd();

/** Escribe un mini-árbol `src/` en un directorio temporal y devuelve sus totales. */
function totalsOf(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rls-surface-"));
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  for (const [name, src] of Object.entries(files)) {
    const abs = path.join(srcDir, name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
  }
  try {
    return countSurface(srcDir, root).totales;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("guard de superficie RLS — el patrón cuenta lo que el repo escribe", () => {
  it("cuenta directDb con el punto en la línea siguiente (la regresión de 2026-10-13)", () => {
    const src = ["const rows = await directDb", "  .select()", "  .from(t);"].join("\n");
    expect(totalsOf({ "a.ts": src }).directDb).toBe(1);
  });

  it("cuenta `db` crudo con el punto en la línea siguiente", () => {
    const src = ["const rows = await db", "  .insert(t)", "  .values(v);"].join("\n");
    expect(totalsOf({ "a.ts": src }).dbSinEnvolver).toBe(1);
  });

  it("sigue contando la forma de una línea, sin doble conteo", () => {
    expect(totalsOf({ "a.ts": "await directDb.select();\nawait db.execute(s);" })).toEqual({
      directDb: 1,
      dbSinEnvolver: 1,
    });
  });

  it("cuenta los métodos reales de acceso, no cualquier propiedad", () => {
    const src = "await directDb.$count(t);\nawait db.transaction(cb);";
    expect(totalsOf({ "a.ts": src })).toEqual({ directDb: 1, dbSinEnvolver: 1 });
  });

  it("no cuenta handles ajenos ni archivos de test", () => {
    const ajenos = "await otroDirectDb.select();\nawait lazyDb.select();\nawait getDb.insert();";
    expect(totalsOf({ "a.ts": ajenos })).toEqual({ directDb: 0, dbSinEnvolver: 0 });
    expect(totalsOf({ "a.test.ts": "await directDb\n  .select();" })).toEqual({
      directDb: 0,
      dbSinEnvolver: 0,
    });
  });

  it("guard e informe comparten UNA definición del patrón", () => {
    const scripts = ["rls-surface-guard.mjs", "rls-surface-report.mjs"].map((f) =>
      fs.readFileSync(path.join(ROOT, "scripts/db", f), "utf8"),
    );
    for (const src of scripts) {
      expect(src).toMatch(/from "\.\/rls-surface-patterns\.mjs"/);
      // Si alguien vuelve a definir el regex en su script, las dos herramientas
      // pueden contar cosas distintas sin que nada avise.
      expect(src).not.toMatch(/const RE_(DIRECT|BARE)\s*=/);
    }
  });

  it("un archivo que baja a CERO llamadas se reporta (agujero del 2026-10-13)", () => {
    // Antes el gate iteraba solo los archivos medidos: `migrado.ts` desaparecía
    // del conteo y no generaba discrepancia, así que el baseline se quedaba por
    // encima del árbol y el gate imprimía «OK» con totales que no cuadraban.
    const baseline = { "migrado.ts": { directDb: 6, dbSinEnvolver: 0 } };
    const discrepancias = diffBaseline(baseline, []);

    expect(discrepancias).toHaveLength(1);
    expect(discrepancias[0]).toMatchObject({
      archivo: "migrado.ts",
      tipo: "vacio",
      ahora: { directDb: 0, dbSinEnvolver: 0 },
      delta: { directDb: -6, dbSinEnvolver: 0 },
    });
    expect(formatDiscrepancy(discrepancias[0])).toContain("re-congela con --snapshot");
  });

  it("no inventa discrepancias cuando el árbol coincide con el baseline", () => {
    const baseline = {
      "a.ts": { directDb: 2, dbSinEnvolver: 1 },
      "b.ts": { directDb: 0, dbSinEnvolver: 3 },
    };
    const iguales = [
      { archivo: "a.ts", directDb: 2, dbSinEnvolver: 1 },
      { archivo: "b.ts", directDb: 0, dbSinEnvolver: 3 },
    ];

    expect(diffBaseline(baseline, iguales)).toEqual([]);
  });

  it("distingue un archivo nuevo de un aumento en un archivo congelado", () => {
    const baseline = { "a.ts": { directDb: 1, dbSinEnvolver: 0 } };
    const discrepancias = diffBaseline(baseline, [
      { archivo: "a.ts", directDb: 1, dbSinEnvolver: 0 },
      { archivo: "nuevo.ts", directDb: 2, dbSinEnvolver: 0 },
    ]);

    expect(discrepancias).toEqual([
      { archivo: "nuevo.ts", tipo: "nuevo", antes: null, ahora: { directDb: 2, dbSinEnvolver: 0 }, delta: null },
    ]);
    expect(formatDiscrepancy(discrepancias[0])).toContain("ARCHIVO NUEVO (sin baseline)");
  });

  it("una reducción parcial no marca mejora sólo por bajar el total", () => {
    const baseline = { "a.ts": { directDb: 2, dbSinEnvolver: 1 } };
    const [sube] = diffBaseline(baseline, [{ archivo: "a.ts", directDb: 3, dbSinEnvolver: 1 }]);
    const [baja] = diffBaseline(baseline, [{ archivo: "a.ts", directDb: 1, dbSinEnvolver: 1 }]);

    expect(formatDiscrepancy(sube)).toContain("(Δ +1 / 0)");
    expect(formatDiscrepancy(sube)).not.toContain("re-congela");
    expect(formatDiscrepancy(baja)).toContain("(Δ -1 / 0)");
    expect(formatDiscrepancy(baja)).toContain("re-congela con --snapshot");
  });

  it("el baseline congelado coincide con el árbol (si no, falta --snapshot)", () => {
    const threshold = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".rls-surface-threshold.json"), "utf8"),
    );
    const { totales } = countSurface(path.join(ROOT, "src"), ROOT);

    expect(totales).toEqual({
      directDb: threshold.maxDirectDbCalls,
      dbSinEnvolver: threshold.maxDbCallsOutsideWithRLS,
    });
    expect(totales.directDb + totales.dbSinEnvolver).toBe(threshold.maxTotalCalls);
  });
});
