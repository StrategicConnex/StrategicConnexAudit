// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Regresión del defecto raíz de P0.5 (2026-10-12): el schema de Drizzle
 * declaraba FK que la base de datos nunca tuvo. `drift-check.mjs` las trata
 * como drift *adhesivo* (avisa, no falla), así que 11 FK estuvieron ausentes en
 * producción sin poner nada en rojo — 250 filas huérfanas de residuo.
 *
 * Esta suite es estática (sin BD, salvo el último caso que demuestra el
 * contrato de "no puedo verificar ≠ todo bien") y protege tres cosas:
 *   1. la migración que restituye las FK existe y está registrada en el journal;
 *   2. `fk-schema-drift-guard.mjs` es SOLO LECTURA (jamás repara la BD él mismo);
 *   3. la migración limpia los huérfanos ANTES de añadir cada FK.
 */

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const GUARD = path.join(ROOT, "scripts/db/fk-schema-drift-guard.mjs");
const TAG = "0044_restore_missing_fks";

const guardSrc = fs.readFileSync(GUARD, "utf8");
const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${TAG}.sql`), "utf8");

/** Quita comentarios SQL: una mención en prosa no es una sentencia. */
const sinComentarios = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

// OJO: se separa por marcador ANTES de quitar comentarios — los propios
// marcadores (`--> statement-breakpoint`) empiezan por `--` y un strip global
// los borraría, dejando todo el archivo como una sola sentencia.
const statements = migrationSql
  .split(/--> statement-breakpoint/)
  .map((s) => s.replace(/^[ \t]*--[^\n]*$/gm, "").trim())
  .filter(Boolean);

describe("P0.5-E — migración que restituye las FK ausentes", () => {
  it("existe y está registrada en el journal con un `when` posterior", () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, `${TAG}.sql`))).toBe(true);

    const journal = JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as {
      entries: { idx: number; tag: string; when: number }[];
    };
    const entrada = journal.entries.find((e) => e.tag === TAG);
    expect(entrada, `falta ${TAG} en _journal.json`).toBeDefined();

    // `drizzle-kit migrate` sólo aplica las entradas cuyo `when` supera el de la
    // última migración aplicada: si `when` no crece, la migración queda escrita
    // pero nunca se aplica. La comparación correcta es contra las PREDECESORAS
    // (idx menor), no contra «las demás» ni contra «la última del journal».
    // [Corregido 2026-10-12 al crear 0045]: la versión previa exigía que 0044
    // fuera la última entrada, lo que convertía en fallo la llegada de cualquier
    // migración posterior — es decir, rompía justo cuando el proyecto avanza.
    const predecesoras = journal.entries.filter((e) => e.idx < entrada!.idx);
    expect(predecesoras.length).toBeGreaterThan(0);
    expect(entrada!.when).toBeGreaterThan(Math.max(...predecesoras.map((e) => e.when)));
    expect(journal.entries.filter((e) => e.tag === TAG)).toHaveLength(1);
  });

  it("limpia los huérfanos ANTES de añadir la FK de esa tabla", () => {
    // Por cada ADD CONSTRAINT, la tabla hija debe tener ya un UPDATE o DELETE
    // en el archivo: añadir la FK con huérfanos presentes la haría fallar.
    const limpiadas = new Set<string>();
    const sinLimpiar: string[] = [];

    for (const stmt of statements) {
      const update = stmt.match(/^(?:UPDATE|DELETE FROM)\s+"?([a-z_]+)"?/i);
      if (update) limpiadas.add(update[1]!.toLowerCase());

      const alter = stmt.match(
        /^ALTER TABLE\s+"?([a-z_]+)"?\s+ADD CONSTRAINT[\s\S]*FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+"?([a-z_]+)"?/i,
      );
      if (alter) {
        const child = alter[1]!.toLowerCase();
        // `users.projects` y demás padres también deben tener sus huérfanos
        // limpios, pero la obligación mínima es sobre la tabla hija.
        if (!limpiadas.has(child)) sinLimpiar.push(child);
      }
    }

    expect(sinLimpiar).toEqual([]);
    // Las 11 FK del barrido (93 declaradas − 82 presentes medidas el 2026-10-12).
    expect(statements.filter((s) => /ADD CONSTRAINT/i.test(s))).toHaveLength(11);
  });

  it("usa la política del schema: re-parenta a NULL y sólo borra lo que es NOT NULL", () => {
    // Columnas de las que el schema dice NOT NULL (no hay re-parentado posible).
    const notNull = [
      ["adversary_engagements", "project_id"],
      ["adversary_task_nodes", "engagement_id"],
    ];
    for (const [tabla, col] of notNull) {
      expect(migrationSql).toMatch(
        new RegExp(`DELETE FROM "${tabla}"[\\s\\S]*?NOT EXISTS`, "i"),
      );
      // Nunca un SET NULL sobre una columna NOT NULL: la sentencia fallaría.
      expect(sinComentarios(migrationSql)).not.toMatch(
        new RegExp(`UPDATE "${tabla}"[\\s\\S]{0,200}?SET "${col}" = NULL`, "i"),
      );
    }

    // Las columnas nullable problemáticas SÍ se re-parentan (se conservan filas).
    for (const tabla of ["intelligence_tool_runs", "intelligence_findings", "intelligence_assets"]) {
      expect(migrationSql).toMatch(
        new RegExp(`UPDATE "${tabla}"[\\s\\S]{0,300}?SET "investigation_id" = NULL`, "i"),
      );
    }
  });

  it("no elimina ninguna fila de las tablas con huérfanos re-parentables", () => {
    for (const tabla of ["intelligence_tool_runs", "intelligence_findings", "intelligence_assets"]) {
      expect(sinComentarios(migrationSql)).not.toMatch(new RegExp(`DELETE FROM "${tabla}"`, "i"));
    }
  });
});

describe("P0.5-F — el guard de FK es de solo lectura y no se calla", () => {
  it("sólo ejecuta SELECT (nunca repara la BD por su cuenta)", () => {
    // El guard hace 2 consultas: el catálogo de FK y la lista de tablas de
    // `public`. Son pocas a propósito — el resto del trabajo es análisis
    // estático del schema en TypeScript.
    const queries = [...guardSrc.matchAll(/client\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1]!.trim());
    expect(queries).toHaveLength(2);
    // Fuentes de verdad: el catálogo de constraints y las tablas existentes.
    expect(guardSrc).toContain("pg_constraint");
    expect(guardSrc).toContain("pg_tables");
    for (const q of queries) {
      expect(q).toMatch(/^SELECT\b/i);
      expect(q).not.toMatch(/\b(DROP|ALTER|CREATE|TRUNCATE|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i);
    }
  });

  it("sale con 2 (no con 0) cuando no puede verificar", () => {
    // Un guard que devolviera 0 al no poder conectarse sería peor que ninguno:
    // CI lo leería como «schema y BD alineados».
    expect(guardSrc).toMatch(/process\.exit\(2\)/);
    expect(guardSrc).toMatch(/process\.exit\(hard === 0 \? 0 : 1\)/);
  });

  it("falla de verdad contra una base inalcanzable (exit 2, ni 0 ni 1)", () => {
    // DIRECT_URL del entorno gana sobre .env.local; puerto 1 en loopback falla
    // al instante (sin DNS), así que la prueba no depende de la red.
    let status = 0;
    try {
      execFileSync(process.execPath, ["scripts/db/fk-schema-drift-guard.mjs"], {
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
});

/**
 * P0.5-I (2026-10-12) — decisión de producto: en un sistema de auditoría los
 * hallazgos (`findings`), las ejecuciones de herramienta (`tool_runs`) y los
 * activos descubiertos (`assets`) tienen valor forense propio, así que su FK a
 * `intelligence_investigations` pasa de CASCADE a SET NULL: sobreviven al
 * borrado de la investigación que los originó. Esta suite protege la decisión
 * sin necesidad de BD — que schema y migración digan lo mismo, que la migración
 * sea idempotente, y que no toque `run_events` (NOT NULL: ahí SET NULL es
 * imposible y la regla es CASCADE).
 */
describe("P0.5-I — 0045: SET NULL en las FK nullable de intelligence_*", () => {
  const TAG45 = "0045_intelligence_set_null_on_delete";
  const sql45 = fs.readFileSync(path.join(MIGRATIONS_DIR, `${TAG45}.sql`), "utf8");
  const limpio45 = sinComentarios(sql45);
  const stmts45 = sql45
    .split(/--> statement-breakpoint/)
    .map((s) => s.replace(/^[ \t]*--[^\n]*$/gm, "").trim())
    .filter(Boolean);
  const TABLAS = ["intelligence_tool_runs", "intelligence_findings", "intelligence_assets"];

  it("está registrada en el journal con un `when` posterior a sus predecesoras", () => {
    const journal = JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as {
      entries: { idx: number; tag: string; when: number }[];
    };
    const entrada = journal.entries.find((e) => e.tag === TAG45);
    expect(entrada, `falta ${TAG45} en _journal.json`).toBeDefined();
    const predecesoras = journal.entries.filter((e) => e.idx < entrada!.idx);
    expect(entrada!.when).toBeGreaterThan(Math.max(...predecesoras.map((e) => e.when)));
  });

  it("el schema y la migración coinciden: SET NULL en las 3 nullable, CASCADE intacto en run_events", () => {
    const schemaSrc = fs
      .readFileSync(path.join(ROOT, "src/shared/db/schemas/intelligence.ts"), "utf8")
      .replace(/\/\/[^\n]*/g, " "); // los comentarios documentan la decisión, no son código

    const columna = (tabla: string) => {
      const desde = schemaSrc.indexOf(`pgTable("${tabla}"`);
      expect(desde, `no existe pgTable("${tabla}")`).toBeGreaterThan(-1);
      const siguiente = schemaSrc.indexOf("pgTable(", desde + 1);
      const body = schemaSrc.slice(desde, siguiente === -1 ? undefined : siguiente);
      const m = body.match(/investigationId: uuid\("investigation_id"\)[\s\S]*?\)(?:\.notNull\(\))?,/);
      expect(m, `sin investigation_id en ${tabla}`).not.toBeNull();
      return m![0];
    };

    for (const tabla of TABLAS) expect(columna(tabla)).toContain('onDelete: "set null"');

    // NOT NULL: SET NULL sería inválido, la regla debe seguir siendo CASCADE.
    const runEvents = columna("intelligence_run_events");
    expect(runEvents).toContain(".notNull()");
    expect(runEvents).toContain('onDelete: "cascade"');
  });

  it("declara SET NULL y sólo toca las 3 tablas nullable", () => {
    const acciones = [...limpio45.matchAll(/ON DELETE ([A-Z ]+?)\s*;/g)].map((m) => m[1]!.trim());
    expect(acciones).toEqual(["SET NULL", "SET NULL", "SET NULL"]);
    for (const tabla of TABLAS) expect(limpio45).toContain(`ALTER TABLE "${tabla}"`);
    // `run_events` es NOT NULL: excluirla es parte de la decisión, no un olvido.
    expect(limpio45).not.toContain("intelligence_run_events");
  });

  it("es idempotente: DROP CONSTRAINT IF EXISTS (nombre real + alternativo) antes de cada ADD", () => {
    const adds = stmts45.filter((s) => /^ALTER TABLE\s+"[a-z_]+"\s+ADD CONSTRAINT/i.test(s));
    expect(adds).toHaveLength(3);

    for (const add of adds) {
      const tabla = add.match(/^ALTER TABLE\s+"([a-z_]+)"/i)![1]!;
      const drop = stmts45.find((s) => new RegExp(`^ALTER TABLE\\s+"${tabla}"\\s+DROP CONSTRAINT`, "i").test(s));
      expect(drop, `sin DROP previo para ${tabla}`).toBeDefined();

      // El nombre que Postgres guardó de verdad: drizzle-kit propone el largo y
      // el motor lo trunca a 63 bytes. Un DROP del nombre sin truncar no
      // encontraría nada y el ADD fallaría por FK duplicada al re-ejecutar.
      const truncado = `${tabla}_investigation_id_intelligence_investigations_id_fk`.slice(0, 63);
      expect(drop).toContain(`"${truncado}"`);
      // Red de seguridad para entornos que las crearon a mano con la convención
      // `_fkey` de Postgres.
      expect(drop).toContain(`"${tabla}_investigation_id_fkey"`);

      // Y el DROP va antes del ADD, no después.
      expect(stmts45.indexOf(drop!)).toBeLessThan(stmts45.indexOf(add));
    }
  });
});
