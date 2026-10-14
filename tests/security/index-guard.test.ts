// @vitest-environment node
/**
 * Guard de índices declarados en las migraciones vs base de datos.
 *
 * Contexto (P1-10, 2026-10-14): `drift-check.mjs` compara tablas, columnas,
 * nullability y defaults, pero NO índices. Por ese hueco ciego, 32 índices
 * declarados con `IF NOT EXISTS` en `0012`/`0015`/`0019` estuvieron ausentes en
 * producción mientras el ledger los daba por aplicados; el efecto medido fueron
 * 42 columnas FK sin índice cubridor y seq scans en rutas calientes.
 *
 * Estos casos fijan lo que hace que el guard valga algo: (1) que lea el DDL y no
 * las menciones en comentarios —el primer barrido a mano reportó los índices
 * fantasma «IF»/«if» justo por eso—; (2) que la decisión del gate distinga
 * «declarado y ausente» (regresión, falla) de «presente y no declarado» (patrón
 * preexistente, sólo aviso); (3) que falle de verdad cuando no puede verificar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  collectDeclaredIndexes,
  compareIndexes,
  extractIndexDeclarations,
  formatMissingIndex,
} from "../../scripts/db/index-patterns.mjs";

const ROOT = process.cwd();
const GUARD = path.join(ROOT, "scripts/db/index-guard.mjs");
const MIGRATIONS = path.join(ROOT, "drizzle");
const guardSrc = fs.readFileSync(GUARD, "utf8");

interface GuardRun {
  status: number;
  stdout: string;
  stderr: string;
}

function runGuard(args: string[] = [], env: Record<string, string> = {}): GuardRun {
  try {
    const out = execFileSync(process.execPath, [GUARD, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "pipe",
      timeout: 30_000,
    });
    return { status: 0, stdout: String(out), stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: e.status ?? -1,
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
    };
  }
}

/** El guard sale con 2 cuando no puede verificar; cualquier otro código implica
 *  que SÍ llegó a medir la base. */
const probe = runGuard(["--print-report"]);
const dbReachable = probe.status !== 2;

describe("index-guard — extracción de declaraciones", () => {
  it("extrae nombre, UNIQUE, tabla y columnas (con y sin comillas)", () => {
    const decls = extractIndexDeclarations(
      `
CREATE INDEX IF NOT EXISTS idx_plano ON public.tabla_a (col_a);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_citado" ON "tabla_b" ("col_b", "col_c");
CREATE INDEX idx_sin_if ON tabla_c USING btree (col_d);
`,
      "0001_x.sql",
    );

    expect(decls.map((d) => d.name)).toEqual(["idx_plano", "idx_citado", "idx_sin_if"]);
    expect(decls[0]).toMatchObject({ unique: false, table: "tabla_a", columns: "col_a" });
    expect(decls[1]).toMatchObject({ unique: true, table: "tabla_b", columns: "col_b, col_c" });
    expect(decls[2]).toMatchObject({ unique: false, table: "tabla_c", columns: "col_d" });
  });

  it("IGNORA las menciones dentro de comentarios (regresión real: índices fantasma «IF»/«if»)", () => {
    // Réplica del caso que rompió el primer barrido: `0037` y `2026-09-24`
    // mencionan «CREATE INDEX IF NOT EXISTS» en prosa y el parseo lo tomaba por
    // un statement, inventando índices llamados «IF» e «if».
    const decls = extractIndexDeclarations(
      `
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- create index if not exists idx_solo_comentario on public.nada (x);
/* CREATE INDEX IF NOT EXISTS idx_bloque on public.nada (x); */
CREATE INDEX IF NOT EXISTS idx_real ON public.tabla_real (col_real);
`,
      "0099_x.sql",
    );

    expect(decls.map((d) => d.name)).toEqual(["idx_real"]);
  });

  it("soporta multilínea y espacios raros entre ON y la tabla", () => {
    const decls = extractIndexDeclarations(
      `
CREATE INDEX IF NOT EXISTS idx_multilinea
  ON public.tabla_m (col_1, col_2);
`,
      "0002_y.sql",
    );
    expect(decls).toHaveLength(1);
    expect(decls[0]).toMatchObject({ name: "idx_multilinea", table: "tabla_m", columns: "col_1, col_2" });
  });

  it("deduplica por nombre dentro del archivo y entre archivos gana el primero (orden cronológico)", () => {
    const enUnArchivo = extractIndexDeclarations(
      `
CREATE INDEX IF NOT EXISTS idx_dup ON public.a (x);
CREATE INDEX IF NOT EXISTS idx_dup ON public.a (x);
`,
      "0003_z.sql",
    );
    expect(enUnArchivo).toHaveLength(1);

    const entreArchivos = collectDeclaredIndexes([
      { file: "0001.sql", sql: "CREATE INDEX IF NOT EXISTS idx_cruce ON public.t (a);" },
      { file: "0002.sql", sql: "CREATE INDEX IF NOT EXISTS idx_cruce ON public.t (b);" },
    ]);
    expect(entreArchivos).toHaveLength(1);
    expect(entreArchivos[0]).toMatchObject({ file: "0001.sql", columns: "a" });
  });
});

describe("index-guard — decisión del gate", () => {
  it("declarado y presente → sin faltantes", () => {
    const { missing, extra } = compareIndexes([{ name: "idx_ok" }], new Set(["idx_ok"]));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("declarado y AUSENTE → es regresión y el mensaje la nombra", () => {
    const { missing } = compareIndexes(
      [{ name: "idx_ausente", file: "0015_core_fk_indexes.sql", table: "uptime_logs", columns: "project_id, checked_at" }],
      new Set(["idx_otro"]),
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ name: "idx_ausente", file: "0015_core_fk_indexes.sql" });

    const msg = formatMissingIndex(missing[0]);
    expect(msg).toContain("AUSENTE EN BD");
    expect(msg).toContain("idx_ausente");
    expect(msg).toContain("uptime_logs");
  });

  it("presente pero NO declarado → aviso, nunca regresión", () => {
    // Patrón preexistente del repo: constraints UNIQUE inline y índices creados
    // a mano. Bloquear por ellos convertiría el guard en un falso positivo fijo.
    const { missing, extra } = compareIndexes([], new Set(["users_email_unique", "idx_a_mano"]));
    expect(missing).toEqual([]);
    expect(extra.map((e) => e.name)).toEqual(["idx_a_mano", "users_email_unique"]);
  });

  it("la salida es determinista (ordenada por nombre)", () => {
    const { missing, extra } = compareIndexes([{ name: "z" }, { name: "a" }], new Set(["c", "b"]));
    expect(missing.map((m) => m.name)).toEqual(["a", "z"]);
    expect(extra.map((e) => e.name)).toEqual(["b", "c"]);
  });
});

describe("index-guard — el guard es honesto y de solo lectura", () => {
  it("comparte UNA definición del parseo con la librería (no reimplementa)", () => {
    expect(guardSrc).toMatch(/from "\.\/index-patterns\.mjs"/);
    expect(guardSrc).not.toMatch(/const\s+\w*CREATE_INDEX\w*\s*=\s*[/`]/);
  });

  it("solo ejecuta SELECT (jamás repara la base por su cuenta)", () => {
    // Se inspeccionan las queries REALES que el guard manda al cliente, no el
    // archivo entero: los mensajes de ayuda mencionan «CREATE INDEX» en prosa y
    // un grep ingenuo sobre el texto los tomaría por DDL ejecutable.
    const queries = [...guardSrc.matchAll(/client\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1].trim());
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q).toMatch(/^select\b/i);
      expect(q).not.toMatch(/\b(CREATE|DROP|ALTER|REINDEX|TRUNCATE|GRANT|REVOKE)\b/i);
    }
  });

  it("sale con 2 (no con 0) cuando no puede verificar", () => {
    expect(guardSrc).toMatch(/process\.exit\(2\)/);

    const run = runGuard([], {
      DIRECT_URL: "postgresql://x:x@127.0.0.1:1/x",
      DATABASE_URL: "postgresql://x:x@127.0.0.1:1/x",
    });
    expect(run.status).toBe(2);
  });

  it.runIf(dbReachable)("contra la base real: todo índice declarado existe → exit 0", () => {
    const run = runGuard();
    expect(run.stdout).toContain("index-guard: OK");
    expect(run.status).toBe(0);
  });

  it.runIf(dbReachable)("índice declarado en una migración pero ausente en BD → exit 1 nombrando el índice", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idx-guard-"));
    try {
      fs.writeFileSync(
        path.join(tmp, "9999_regresion_simulada.sql"),
        "CREATE INDEX IF NOT EXISTS zz_index_guard_regresion ON public.users (plan_id);\n",
      );
      const run = runGuard([`--migrations-dir=${tmp}`]);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("zz_index_guard_regresion");
      expect(run.stderr).toContain("AUSENTE EN BD");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("index-guard — el DDL restituido en 0050 queda bajo vigilancia", () => {
  it("las declaraciones de la migración 0050 entran al conjunto vigilado", () => {
    const files = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS, f), "utf8") }));

    const names = new Set(collectDeclaredIndexes(files).map((d) => d.name));
    for (const esperado of [
      "idx_uptime_logs_project_checked",
      "idx_audit_logs_project_created",
      "idx_reports_project",
      "idx_web_vitals_project_recorded",
      "idx_whois_history_investigation",
      "idx_users_plan",
    ]) {
      expect(names, `${esperado} debe estar declarado`).toContain(esperado);
    }
  });
});
