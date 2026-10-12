// @vitest-environment node
/**
 * Guard anti-regresión del hallazgo #6 de la auditoría de BD (2026-10-11):
 * `TRUNCATE` concedido a `authenticated` en 33 tablas públicas.
 *
 * TRUNCATE NO pasa por RLS, así que el privilegio anulaba el aislamiento
 * multi-tenant para ese comando. Este test es estático (sin base de datos) y
 * protege la migración que lo revoca; la verificación REAL contra la base la
 * hace `scripts/db/grant-audit.mjs` (read-only, exit 1 si reaparece).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const TAG = "0042_revoke_truncate_authenticated";
const ROLES_EXPUESTOS = ["authenticated", "anon"];

/** Quita comentarios SQL: una mención en prosa no es una concesión real. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const migraciones = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8") }));

describe("Hallazgo #6 — TRUNCATE no debe estar concedido a roles expuestos", () => {
  it("la migración que revoca TRUNCATE existe y está registrada en el journal", () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, `${TAG}.sql`))).toBe(true);

    const journal = JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as {
      entries: { idx: number; tag: string; when: number }[];
    };
    const entrada = journal.entries.find((e) => e.tag === TAG);
    expect(entrada, `falta ${TAG} en _journal.json`).toBeDefined();

    // `when` debe ser mayor que el máximo previo o drizzle-kit migrate la
    // saltaría silenciosamente.
    const maxOtros = Math.max(...journal.entries.filter((e) => e.tag !== TAG).map((e) => e.when));
    expect(entrada!.when).toBeGreaterThan(maxOtros);
  });

  it("la migración revoca TRUNCATE de authenticated y anon", () => {
    const sql = sinComentarios(fs.readFileSync(path.join(MIGRATIONS_DIR, `${TAG}.sql`), "utf8"));
    for (const rol of ROLES_EXPUESTOS) {
      expect(sql).toMatch(new RegExp(`REVOKE\\s+TRUNCATE\\s+ON\\s+ALL\\s+TABLES\\s+IN\\s+SCHEMA\\s+public\\s+FROM\\s+${rol}`, "i"));
    }
  });

  it("ninguna migración concede TRUNCATE a un rol expuesto", () => {
    const ofensivas: string[] = [];
    for (const { file, sql } of migraciones) {
      const limpio = sinComentarios(sql);
      const re = new RegExp(`GRANT\\s+[^;]*\\bTRUNCATE\\b[^;]*\\b(${ROLES_EXPUESTOS.join("|")})\\b`, "gi");
      for (const m of limpio.matchAll(re)) ofensivas.push(`${file}: ${m[0].trim()}`);
    }
    expect(ofensivas).toEqual([]);
  });

  it("el inventario contra la base es read-only (solo SELECT)", () => {
    const src = fs.readFileSync(path.join(ROOT, "scripts/db/grant-audit.mjs"), "utf8");
    // Sólo se inspeccionan las sentencias realmente ejecutadas (los template
    // literals de `client.query(...)`), no la prosa de los mensajes.
    const queries = [...src.matchAll(/\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1].trim());
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      // Una sentencia que empieza por SELECT es de solo lectura por definición.
      expect(q).toMatch(/^SELECT\b/i);
      expect(q).not.toMatch(/\b(DROP|ALTER|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET)\b/i);
      // `'TRUNCATE'` como VALOR de privilege_type es legítimo; como sentencia no.
      expect(q).not.toMatch(/\bTRUNCATE\s+(TABLE\b|["a-z_]+\s*;)/i);
    }
    // Fuente de verdad del inventario: el catálogo de privilegios.
    expect(src).toContain("information_schema.role_table_grants");
  });
});
