#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Anti-drift: schema de Drizzle vs base de datos real.

   Compara los pgTable/pgEnum del schema de Drizzle contra la BD y FALLA
   (exit 1) si hay drift DURO:

   ❌ duro  → tablas ausentes, columnas ausentes, tipos divergentes,
              enums divergentes.
   ⚠️  adhesivo → nullability, defaults, columnas extra en BD, FK/PK/UNIQUE.
              Se reportan pero no fallan (se normalizan con db:generate/migrate).

   Uso:
     node scripts/db/drift-check.mjs            # check completo
     node scripts/db/drift-check.mjs --json     # salida JSON para CI

   Variables: DIRECT_URL (o DATABASE_URL) en .env.local o entorno.
   En CI (sin .env.local): exporta DIRECT_URL antes de invocar.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const AS_JSON = process.argv.includes("--json");

// ── .env.local sin dependencias (CI puede usar env del sistema) ─────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida");
  process.exit(1);
}

// ── 1. Parsear el schema de Drizzle (TypeScript) ────────────────────────
const SCHEMA_DIR = path.join(ROOT, "src/shared/db/schemas");

// Tipos TS de drizzle → tipo base esperado en information_schema.
// (ya normalizado igual que normalizeDbType: varchar, no "character varying")
const TS_KIND_TO_DB = {
  uuid: "uuid",
  text: "text",
  integer: "integer",
  bigint: "bigint",
  boolean: "boolean",
  numeric: "numeric",
  jsonb: "jsonb",
  json: "json",
  date: "date",
  time: "time without time zone",
  varchar: "varchar",
  char: "character",
  real: "real",
  doublePrecision: "double precision",
  bytea: "bytea",
  interval: "interval",
};

function normalizeDbType(t) {
  // information_schema escribe timestamptz como "timestamp with time zone".
  if (t === "timestamp with time zone") return "timestamptz";
  if (t === "timestamp without time zone") return "timestamp";
  if (t === "character varying") return "varchar";
  return t;
}

function parseSchemas() {
  const tables = {}; // name -> { columns, file }
  const enums = {}; // name -> [values]
  const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const src = fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8");

    for (const m of src.matchAll(/pgEnum\(\s*["'`]([^"'`]+)["'`]\s*,\s*\[([^\]]*)\]/gs)) {
      enums[m[1]] = m[2]
        .split(",")
        .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
        .filter(Boolean);
    }

    // Captura balanceada de pgTable("name", { ... }) — cuenta llaves.
    const re = /pgTable\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
    let match;
    while ((match = re.exec(src)) !== null) {
      const name = match[1];
      const start = match.index + match[0].length;
      let depth = 1;
      let i = start;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
      }
      const body = src.slice(start, i - 1);

      // Localizar cada columna y acotar su snippet HASTA la siguiente
      // columna (evita que .notNull()/.default() de la vecina contaminen).
      // Cualquier `ident: Algo("sql_name")` dentro del body es una columna:
      // los kinds primitivos se mapean a tipo BD y el resto (pgEnum) es
      // USER-DEFINED. La indentación mínima de 2 espacios cubre tablas
      // declaradas con el nombre en línea propia (4 espacios).
      const colRe = /^[ \t]{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\(\s*["'`]([^"'`]+)["'`]/gm;
      const found = [];
      let colMatch;
      while ((colMatch = colRe.exec(body)) !== null) {
        found.push({ idx: colMatch.index, camel: colMatch[1], kind: colMatch[2], sqlName: colMatch[3] });
      }
      const columns = {};
      for (let k = 0; k < found.length; k++) {
        const end = k + 1 < found.length ? found[k + 1].idx : body.length;
        columns[found[k].sqlName] = { ...found[k], snippet: body.slice(found[k].idx, end) };
      }
      tables[name] = { columns, file };
    }
  }
  return { tables, enums };
}

// ── 2. Leer la BD real ──────────────────────────────────────────────────
async function readDb(client) {
  const tables = {};
  const cols = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name NOT LIKE 'pg\\_%'
    ORDER BY table_name, ordinal_position
  `);
  for (const r of cols.rows) {
    if (!tables[r.table_name]) tables[r.table_name] = {};
    tables[r.table_name][r.column_name] = {
      type: normalizeDbType(r.data_type),
      nullable: r.is_nullable === "YES",
      default: r.column_default,
    };
  }
  return tables;
}

// ── 3. Comparación ──────────────────────────────────────────────────────
function expectedType(tsCol) {
  if (/\.array\(\)/.test(tsCol.snippet)) return "ARRAY";
  if (tsCol.kind === "timestamp") {
    return /withTimezone\s*:\s*true/.test(tsCol.snippet) ? "timestamptz" : "timestamp";
  }
  // Kind no primitivo → columna de enum (pgEnum) → USER-DEFINED en la BD.
  return TS_KIND_TO_DB[tsCol.kind] ?? null; // null = no comparar tipo
}

function expectedNullable(tsCol) {
  // .primaryKey() implica NOT NULL igual que .notNull().
  return !/\.notNull\(\)|\.primaryKey\(\)/.test(tsCol.snippet);
}

function defaultsEquivalent(tsCol, dbDefault) {
  const hasDefault = /\.default\(|\.defaultNow\(\)|\.defaultRandom\(\)/.test(tsCol.snippet);
  if (dbDefault === null) return !hasDefault;
  if (!hasDefault) return false;
  // defaultNow/defaultRandom tienen equivalencia clara en la BD.
  if (/\.defaultNow\(\)/.test(tsCol.snippet)) return /now\(\)|current_timestamp/i.test(dbDefault);
  if (/\.defaultRandom\(\)/.test(tsCol.snippet)) return /gen_random_uuid\(\)/.test(dbDefault);
  const m = tsCol.snippet.match(/\.default\(([\s\S]{1,120}?)\)[,}\n]/);
  if (!m) return true; // no extraíble → modo tolerante
  let arg = m[1].trim().replace(/^["'`]|["'`]$/g, "");
  const d = String(dbDefault);
  if (/^now\(\)$/i.test(arg)) return /now\(\)|current_timestamp/i.test(d);
  if (arg === "true" || arg === "false") return d === arg;
  if (/^-?\d+(\.\d+)?$/.test(arg)) return d === arg || d === `'${arg}'` || d.startsWith(arg);
  return d.includes(arg) || arg.includes(d.replace(/::\w+$/, ""));
}

// ── Main ────────────────────────────────────────────────────────────────
const drizzle = parseSchemas();
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const db = await readDb(client);

  const drift = { missingTables: [], extraTables: [], columnDrift: [], enumDrift: [] };

  for (const name of Object.keys(drizzle.tables)) {
    if (!db[name]) drift.missingTables.push(name);
  }
  const schemaNames = new Set(Object.keys(drizzle.tables));
  // El ledger de drizzle vive en schema drizzle/ y no forma parte del schema público.
  for (const name of Object.keys(db)) {
    if (!schemaNames.has(name)) drift.extraTables.push(name);
  }

  for (const [name, def] of Object.entries(drizzle.tables)) {
    if (!db[name]) continue;
    const dbCols = db[name];
    for (const colName of Object.keys(def.columns)) {
      const tsCol = def.columns[colName];
      if (!dbCols[colName]) {
        drift.columnDrift.push({ table: name, column: colName, issue: "missing_in_db", severity: "hard" });
        continue;
      }
      const dbCol = dbCols[colName];
      const wantType = expectedType(tsCol);
      // wantType null → enum: los valores se validan vía pg_enum abajo.
      if (wantType !== null && dbCol.type !== wantType) {
        drift.columnDrift.push({ table: name, column: colName, issue: "type", want: wantType, got: dbCol.type, severity: "hard" });
      }
      if (dbCol.nullable !== expectedNullable(tsCol)) {
        drift.columnDrift.push({
          table: name, column: colName, issue: "nullability",
          want: expectedNullable(tsCol) ? "nullable" : "notNull", got: dbCol.nullable ? "nullable" : "notNull",
          severity: "sticky",
        });
      }
      if (!defaultsEquivalent(tsCol, dbCol.default)) {
        drift.columnDrift.push({ table: name, column: colName, issue: "default", got: dbCol.default, severity: "sticky" });
      }
    }
    for (const colName of Object.keys(dbCols)) {
      if (!def.columns[colName]) {
        drift.columnDrift.push({ table: name, column: colName, issue: "extra_in_db", severity: "sticky" });
      }
    }
  }

  const dbEnums = {};
  // enumlabel es tipo `name` → cast a text para que node-pg lo parsee como array.
  const er = await client.query(`
    SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS vals
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' GROUP BY t.typname
  `);
  for (const r of er.rows) dbEnums[r.typname] = Array.isArray(r.vals) ? r.vals : [r.vals];
  for (const [name, vals] of Object.entries(drizzle.enums)) {
    if (!dbEnums[name]) {
      drift.enumDrift.push({ enum: name, issue: "missing_in_db" });
    } else {
      const missing = vals.filter((v) => !dbEnums[name].includes(v));
      const extra = dbEnums[name].filter((v) => !vals.includes(v));
      if (missing.length || extra.length) {
        drift.enumDrift.push({ enum: name, issue: "values", missing, extra });
      }
    }
  }

  // ── Reporte ───────────────────────────────────────────────────────────
  const hardCount =
    drift.missingTables.length +
    drift.columnDrift.filter((c) => c.severity === "hard").length +
    drift.enumDrift.length;

  if (AS_JSON) {
    console.log(JSON.stringify({ ok: hardCount === 0, hardProblems: hardCount, ...drift }, null, 2));
  } else {
    console.log(`\n═══ Anti-drift: schema Drizzle vs BD ═══\n`);
    console.log(`Tablas en schema: ${Object.keys(drizzle.tables).length} · en BD: ${Object.keys(db).length}`);
    if (drift.missingTables.length) console.log(`\n❌ Tablas faltantes en BD: ${drift.missingTables.join(", ")}`);
    if (drift.extraTables.length) console.log(`\n⚠️  Tablas extra en BD (no están en schema — ¿migraciones legacy?): ${drift.extraTables.join(", ")}`);
    if (drift.columnDrift.length) {
      console.log(`\nColumnas:`);
      for (const c of drift.columnDrift) {
        const icon = c.severity === "hard" ? "❌" : "⚠️ ";
        console.log(`  ${icon} ${c.table}.${c.column}: ${c.issue}${c.want ? ` (schema: ${c.want} · bd: ${c.got})` : c.got !== undefined ? ` (bd: ${c.got})` : ""}`);
      }
    }
    if (drift.enumDrift.length) {
      console.log(`\nEnums:`);
      for (const e of drift.enumDrift) console.log(`  ❌ ${e.enum}:`, JSON.stringify(e));
    }
    console.log("");
    if (hardCount > 0) console.log(`🚨 DRIFT DURO: ${hardCount} problema(s) que rompen el contrato schema↔BD.`);
    else console.log(`✅ Sin drift duro entre schema de Drizzle y BD.${drift.columnDrift.length ? ` (${drift.columnDrift.length} diffs adhesivas — arriba)` : ""}`);
  }

  if (hardCount > 0) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error("❌ Error en drift-check:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
