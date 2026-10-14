// @vitest-environment node
/**
 * Guard de grants peligrosos heredados (pgrst_ddl_watch).
 *
 * Hallazgo (2026-10-13): Supabase concede DELETE/TRIGGER/REFERENCES a
 * `authenticated` en cada tabla nueva de `public` vía el event trigger
 * `pgrst_ddl_watch`. No hay fix desde migraciones, así que un baseline congelado
 * es la única red. Estos casos fijan la lógica de diff (los negativos son la
 * razón de ser del guard: uno que sólo dice «ok» no vale nada), que el guard es
 * de SOLO LECTURA y que falla de verdad cuando no puede verificar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  DANGEROUS_PRIVILEGES,
  buildGrantMap,
  diffGrants,
  formatDiscrepancy,
} from "../../scripts/db/inherited-grants-patterns.mjs";

const ROOT = process.cwd();
const GUARD = path.join(ROOT, "scripts/db/inherited-grants-guard.mjs");
const BASELINE = path.join(ROOT, ".inherited-grants-threshold.json");
const guardSrc = fs.readFileSync(GUARD, "utf8");

describe("inherited-grants — lógica de diff", () => {
  it("buildGrantMap agrupa por tabla y deduplica/ordena los privilegios", () => {
    const map = buildGrantMap([
      { table_name: "t1", privilege_type: "TRIGGER" },
      { table_name: "t1", privilege_type: "DELETE" },
      { table_name: "t1", privilege_type: "DELETE" },
      { table_name: "t2", privilege_type: "REFERENCES" },
    ]);
    expect(map).toEqual({ t1: ["DELETE", "TRIGGER"], t2: ["REFERENCES"] });
  });

  it("una tabla NUEVA con grants peligrosos se reporta como regresión", () => {
    const d = diffGrants({}, { projects: ["DELETE"] });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tabla: "projects", tipo: "nuevo", ahora: ["DELETE"] });
    expect(formatDiscrepancy(d[0])).toContain("TABLA NUEVA");
  });

  it("una tabla en el baseline con los MISMOS privilegios no genera discrepancia", () => {
    expect(diffGrants({ projects: ["DELETE", "TRIGGER"] }, { projects: ["DELETE", "TRIGGER"] })).toEqual([]);
  });

  it("una tabla SIN grants peligrosos (ausente del mapa) no genera ruido", () => {
    // El mapa sólo contiene tablas con al menos un privilegio peligroso.
    expect(diffGrants({ projects: ["DELETE"] }, { projects: ["DELETE"] })).toEqual([]);
  });

  it("GANAR un privilegio es regresión; PERDER uno es mejora", () => {
    const [gana] = diffGrants({ t: ["DELETE"] }, { t: ["DELETE", "TRIGGER"] });
    expect(gana).toMatchObject({ tipo: "cambio", ganadas: ["TRIGGER"], perdidas: [] });
    expect(formatDiscrepancy(gana)).not.toContain("re-congela");

    const [pierde] = diffGrants({ t: ["DELETE", "TRIGGER"] }, { t: ["DELETE"] });
    expect(pierde).toMatchObject({ tipo: "cambio", ganadas: [], perdidas: ["TRIGGER"] });
    expect(formatDiscrepancy(pierde)).toContain("re-congela con --snapshot");
  });

  it("revocar TODOS los privilegios de una tabla se reporta como mejora (tipo vacio)", () => {
    const d = diffGrants({ t: ["DELETE", "TRIGGER", "REFERENCES"] }, {});
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tabla: "t", tipo: "vacio", ahora: [] });
    expect(formatDiscrepancy(d[0])).toContain("← mejora");
  });

  it("el diff es determinista (ordenado por tabla)", () => {
    const d = diffGrants({}, { zeta: ["DELETE"], alfa: ["DELETE"], media: ["DELETE"] });
    expect(d.map((x) => x.tabla)).toEqual(["alfa", "media", "zeta"]);
  });
});

describe("inherited-grants — el guard es honesto y de solo lectura", () => {
  it("comparte UNA definición del patrón con la librería (no reimplementa)", () => {
    expect(guardSrc).toMatch(/from "\.\/inherited-grants-patterns\.mjs"/);
    expect(guardSrc).not.toMatch(/const DANGEROUS\w*\s*=\s*\[/);
  });

  it("solo ejecuta SELECT (jamás repara la base por su cuenta)", () => {
    const queries = [...guardSrc.matchAll(/client\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1]!.trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q).toMatch(/^select\b/i);
      expect(q).not.toMatch(/\b(REVOKE|GRANT|DROP|ALTER|CREATE|TRUNCATE|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i);
    }
  });

  it("sale con 2 (no con 0) cuando no puede verificar", () => {
    expect(guardSrc).toMatch(/process\.exit\(2\)/);
  });

  it("falla de verdad contra una base inalcanzable (exit 2, ni 0 ni 1)", () => {
    let status = 0;
    try {
      execFileSync(process.execPath, ["scripts/db/inherited-grants-guard.mjs"], {
        cwd: ROOT,
        env: { ...process.env, DIRECT_URL: "postgresql://x:x@127.0.0.1:1/x", DATABASE_URL: "" },
        stdio: "pipe",
        timeout: 15_000,
      });
    } catch (error) {
      status = (error as { status?: number }).status ?? -1;
    }
    expect(status).toBe(2);
  });

  it("el baseline congelado existe y es coherente con los privilegios vigilados", () => {
    const parsed = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
    expect(parsed.dangerousPrivileges).toEqual(DANGEROUS_PRIVILEGES);
    expect(parsed.baseline && typeof parsed.baseline).toBe("object");

    // Ninguna tabla del baseline puede listar un privilegio fuera del conjunto
    // vigilado: si lo hiciera, el diff lo trataría como «perdido» para siempre.
    for (const [tabla, privs] of Object.entries(parsed.baseline as Record<string, string[]>)) {
      for (const p of privs) expect(DANGEROUS_PRIVILEGES, `tabla ${tabla}`).toContain(p);
      expect(privs).toEqual([...new Set(privs)].sort());
    }
  });
});
