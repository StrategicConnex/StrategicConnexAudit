#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard anti-regresión: FK declaradas en el schema vs la BD real.

   POR QUÉ EXISTE (defecto raíz detectado en P0.5, 2026-10-12):
   el schema de Drizzle declaraba FK que la base de datos NUNCA tuvo. Nada
   fallaba: los `INSERT` seguían funcionando y la BD acumulaba filas huérfanas
   en silencio. Medido: 217 de 417 filas (52 %) de `intelligence_run_events`
   huérfanas, y lo mismo en `intelligence_tool_runs` (147), `intelligence_findings`
   (102) e `intelligence_assets` (1). `drift-check.mjs` no lo cazó porque trata
   FK/PK/UNIQUE como drift *adhesivo* (avisa pero no falla) — y en CI, con todo
   lo demás en verde, un aviso no se lee.

   Este guard es el chequeo DURO y específico que faltaba:

     ❌ FALTA      la FK está declarada con `.references()` pero no existe en
                   `pg_constraint` → la BD puede volver a llenarse de huérfanos.
     ❌ ACCIÓN     la FK existe pero con otro `ON DELETE` que el declarado
                   (`ON DELETE SET NULL` real donde el schema pide CASCADE no
                   protege igual, y al revés borra datos que el schema quiere
                   conservar).
     ❌ TIPO       el DSN de la FK no concuerda (columna hija/padre distinta).

   Solo lee: el schema con análisis estático y la BD con `SELECT`. La reparación
   es una migración (`drizzle-kit generate`/`migrate`), nunca este script.

   Uso:
     node scripts/db/fk-schema-drift-guard.mjs          # informe + veredicto
     node scripts/db/fk-schema-drift-guard.mjs --json    # salida JSON para CI

   Variables: DIRECT_URL (o DATABASE_URL) en .env.local o entorno.
   Exit code: 0 si schema y BD concuerdan, 1 si hay drift de FK, 2 si no se
   puede conectar (así CI distingue «drift real» de «secreto sin configurar»).
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const AS_JSON = process.argv.includes("--json");

// ── .env.local sin dependencias (CI puede usar env del sistema) ─────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida (CI: configúrala como secret).");
  process.exit(2);
}

// ── Códigos de `pg_constraint.confdeltype` verificados empíricamente ────
//   a = NO ACTION · r = RESTRICT · c = CASCADE · n = SET NULL · d = SET DEFAULT
// Ojo: `n` es SET NULL y `a` NO ACTION (un mapeo invertido de estos dos fue un
// bug real en `fake-data-purge.mjs`: leía un SET NULL del schema como bloqueo).
const ACTION_BY_CODE = { a: "no action", r: "restrict", c: "cascade", n: "set null", d: "set default" };
/** Drizzle omite `ON DELETE` (= NO ACTION) cuando no se declara `onDelete`. */
const CODE_BY_DECLARED = { "no action": "a", restrict: "r", cascade: "c", "set null": "n", "set default": "d" };

// ── 1. Schema estático: símbolo TS → tabla SQL y FK declaradas ──────────
const SCHEMA_DIR = path.join(ROOT, "src/shared/db/schemas");

/** Símbolo JS de tabla (`intelligenceToolRuns`) → nombre real (`intelligence_tool_runs`). */
function tableSymbols(files) {
  const map = new Map();
  for (const { src } of files) {
    const re = /(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*pgTable\(\s*["'`]([^"'`]+)["'`]/g;
    for (const m of src.matchAll(re)) map.set(m[1], m[2]);
  }
  return map;
}

/** Cuerpo de cada `pgTable("x", { … })`, con conteo de llaves (no regex perezosa). */
function tableBodies(src) {
  const out = [];
  const re = /pgTable\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    out.push({ table: m[1], body: src.slice(start, i - 1) });
  }
  return out;
}

/**
 * FK declaradas en el schema. Cada columna se acota hasta el inicio de la
 * siguiente para que el `.references()` de la vecina no contamine su snippet.
 */
function declaredForeignKeys() {
  const files = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(SCHEMA_DIR, f), "utf8") }));
  const symbols = tableSymbols(files);
  const fks = [];
  const unresolved = [];

  for (const { file, src } of files) {
    for (const { table, body } of tableBodies(src)) {
      // Inicio de cada columna declarada en el objeto.
      const colRe = /^[ \t]{2,}([a-zA-Z_]\w*)\s*:\s*([a-zA-Z_]\w*)\(\s*["'`]([^"'`]+)["'`]/gm;
      const cols = [];
      let cm;
      while ((cm = colRe.exec(body)) !== null) {
        cols.push({ idx: cm.index, sqlName: cm[3] });
      }
      for (let n = 0; n < cols.length; n++) {
        const end = n + 1 < cols.length ? cols[n + 1].idx : body.length;
        const snippet = body.slice(cols[n].idx, end);
        // `.references(() => tabla.id, { onDelete: "…" })`
        // y la variante con tipo explícito: `.references((): AnyPgColumn => tabla.id, …)`
        const ref = snippet.match(
          /\.references\(\s*(?:\([^)]*\)\s*=>\s*)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*(?:,\s*\{([^}]*)\})?/,
        );
        if (!ref) continue;
        const parentTable = symbols.get(ref[1]);
        if (!parentTable) {
          unresolved.push({ file, table, column: cols[n].sqlName, symbol: ref[1] });
          continue;
        }
        const action = ref[3]?.match(/onDelete\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]?.toLowerCase() ?? "no action";
        fks.push({
          childTable: table,
          childColumn: cols[n].sqlName,
          parentTable,
          parentColumn: ref[2],
          declaredAction: action,
          nullable: !/\.notNull\(\)/.test(snippet),
          file,
        });
      }
    }
  }
  return { fks, unresolved };
}

/** Clave canónica del DSN, independiente del orden de declaración. */
const fkKey = (f) => `${f.childTable}.${f.childColumn}→${f.parentTable}.${f.parentColumn}`;

// ── 2. FK reales en la BD ──────────────────────────────────────────────
async function dbForeignKeys(client) {
  const { rows } = await client.query(`
    SELECT cl.relname  AS child_table,
           att.attname AS child_column,
           pl.relname  AS parent_table,
           patt.attname AS parent_column,
           con.confdeltype,
           con.conname
      FROM pg_constraint con
      JOIN pg_class cl      ON cl.oid = con.conrelid
      JOIN pg_namespace cn  ON cn.oid = cl.relnamespace
      JOIN pg_class pl      ON pl.oid = con.confrelid
      JOIN pg_namespace pn  ON pn.oid = pl.relnamespace
      JOIN LATERAL unnest(con.conkey)   WITH ORDINALITY AS k(attnum, ord)  ON true
      JOIN LATERAL unnest(con.confkey)  WITH ORDINALITY AS rk(attnum, ord) ON rk.ord = k.ord
      JOIN pg_attribute att  ON att.attrelid  = cl.oid AND att.attnum  = k.attnum
      JOIN pg_attribute patt ON patt.attrelid = pl.oid AND patt.attnum = rk.attnum
     WHERE con.contype = 'f'
       AND cn.nspname = 'public'
       AND pn.nspname = 'public'
     ORDER BY 1, 2
  `);
  return rows.map((r) => ({
    childTable: r.child_table,
    childColumn: r.child_column,
    parentTable: r.parent_table,
    parentColumn: r.parent_column,
    code: r.confdeltype,
    action: ACTION_BY_CODE[r.confdeltype] ?? r.confdeltype,
    name: r.conname,
  }));
}

/** Tablas que existen en `public`, para no confundir «tabla sin migrar» con «FK ausente». */
async function dbTables(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  return new Set(rows.map((r) => r.tablename));
}

// ── 3. Comparación ─────────────────────────────────────────────────────
const { fks: declared, unresolved } = declaredForeignKeys();

const client = new pg.Client(connectionFor(dbUrl));
let real = [];
let tables = new Set();
try {
  await client.connect();
  real = await dbForeignKeys(client);
  tables = await dbTables(client);
} catch (error) {
  console.error(`❌ No se pudo conectar a la BD: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
} finally {
  await client.end().catch(() => {});
}

const realByKey = new Map(real.map((f) => [fkKey(f), f]));
const declaredByKey = new Map(declared.map((f) => [fkKey(f), f]));

const missing = declared.filter((f) => !realByKey.has(fkKey(f)));
const actionMismatch = declared
  .filter((f) => realByKey.has(fkKey(f)))
  .map((f) => ({
    ...f,
    actualAction: realByKey.get(fkKey(f)).action,
    expectedCode: CODE_BY_DECLARED[f.declaredAction],
    actualCode: realByKey.get(fkKey(f)).code,
  }))
  .filter((f) => f.expectedCode !== f.actualCode);
/** FK en la BD que el schema no declara (drift inverso): informativo. */
const undeclared = real.filter((f) => !declaredByKey.has(fkKey(f)));
/** Declarada, pero su tabla hija aún no existe en la BD (migración sin aplicar). */
const onMissingTables = missing.filter((f) => !tables.has(f.childTable));
const missingOnLiveTables = missing.filter((f) => tables.has(f.childTable));

const hard = missingOnLiveTables.length + actionMismatch.length;

// ── 4. Informe ─────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        declared: declared.length,
        inDatabase: real.length,
        missingOnLiveTables,
        missingOnMissingTables: onMissingTables,
        actionMismatch: actionMismatch.map((f) => ({
          constraint: `${f.childTable}.${f.childColumn}`,
          parent: `${f.parentTable}.${f.parentColumn}`,
          declaredAction: f.declaredAction,
          actualAction: f.actualAction,
        })),
        undeclaredInSchema: undeclared.map((f) => ({
          constraint: `${f.childTable}.${f.childColumn}`,
          parent: `${f.parentTable}.${f.parentColumn}`,
          action: f.action,
        })),
        unresolvedReferences: unresolved,
        verdict: hard === 0 ? "ok" : "drift",
      },
      null,
      2,
    ),
  );
} else {
  console.log("🔗 SCAUDIT — Guard de FK: schema de Drizzle vs base de datos real\n");
  console.log(`   FK declaradas en el schema : ${declared.length}`);
  console.log(`   FK existentes en la BD     : ${real.length}`);

  if (missingOnLiveTables.length > 0) {
    console.log(`\n❌ FALTA — declaradas y AUSENTES en la BD (${missingOnLiveTables.length}):`);
    for (const f of missingOnLiveTables) {
      console.log(
        `   ${f.childTable}.${f.childColumn} → ${f.parentTable}.${f.parentColumn}` +
          `  [ON DELETE ${f.declaredAction.toUpperCase()}, columna ${f.nullable ? "NULLABLE" : "NOT NULL"}]  (${f.file})`,
      );
    }
  }

  if (actionMismatch.length > 0) {
    console.log(`\n❌ ACCIÓN — existe la FK pero con otro ON DELETE (${actionMismatch.length}):`);
    for (const f of actionMismatch) {
      console.log(
        `   ${f.childTable}.${f.childColumn} → ${f.parentTable}.${f.parentColumn}` +
          `  schema=${f.declaredAction.toUpperCase()} / BD=${f.actualAction.toUpperCase()}  (${f.file})`,
      );
    }
  }

  if (onMissingTables.length > 0) {
    console.log(`\n⚠️  DIFERIDO — FK de tablas que aún no existen en la BD (${onMissingTables.length}):`);
    for (const f of onMissingTables) console.log(`   ${f.childTable}.${f.childColumn} → ${f.parentTable}.${f.parentColumn}`);
  }

  if (undeclared.length > 0) {
    console.log(`\n⚠️  NO DECLARADA — la BD tiene FK que el schema no declara (${undeclared.length}):`);
    for (const f of undeclared) {
      console.log(`   ${f.childTable}.${f.childColumn} → ${f.parentTable}.${f.parentColumn}  [${f.action}]  (${f.name})`);
    }
  }

  if (unresolved.length > 0) {
    console.log(`\n⚠️  SIN RESOLVER — referencia a un símbolo que no es pgTable (${unresolved.length}):`);
    for (const f of unresolved) console.log(`   ${f.table}.${f.column} → ${f.symbol}  (${f.file})`);
  }

  if (hard === 0) {
    console.log("\nRESULTADO: sin drift de FK — toda FK declarada existe con la acción correcta.");
  } else {
    console.log(`\nRESULTADO: ${hard} problema(s) DURO(s) de FK. Repáralos con una migración.`);
  }
}

process.exit(hard === 0 ? 0 : 1);
