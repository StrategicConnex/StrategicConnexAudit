#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard de `DROP TABLE … CASCADE` (clase de bug de P2-16)

   POR QUÉ EXISTE (bug real, 2026-10-16): la 0052 elimina `project_members`,
   pero 21 policies de 0016/0017/0022/0023/0024 tenían subqueries contra esa
   tabla. `DROP TABLE … CASCADE` se lleva por delante esas policies en
   SILENCIO: las tablas quedan con RLS activa y sin ninguna policy (fail-closed
   para todos menos los roles con BYPASSRLS) y el síntoma en producción es
   «0 filas», no un error. Ningún gate miraba ese acoplamiento.

   QUÉ HACE: reconstruye el estado VIVO de las migraciones en orden de journal
   (no en orden alfabético) y, en cada `DROP TABLE … CASCADE`, comprueba si
   alguna policy de OTRA tabla —o alguna función— seguiría leyendo la tabla
   que desaparece. Las policies que la propia migración recrea antes del DROP
   (el patrón de la 0052) no cuentan: su estado vivo ya no la referencia.

   POR QUÉ NO ES UN GREP: un barrido plano de todos los `CREATE POLICY` marcaría
   la 0052 por policies que la 0052 misma reescribe, y a la inversa no vería una
   policy borrada por `DROP POLICY`. El guard reaplica `CREATE POLICY`,
   `DROP POLICY` y `CREATE OR REPLACE FUNCTION` en orden antes de cada DROP.

   LO QUE NO PUEDE VER: SQL dinámico (`EXECUTE format('CREATE POLICY …')`, usado
   en 0027). Si el template referencia una tabla que se va a borrar, se reporta
   como hallazgo (conservador: no puede demostrar que sea seguro). Si el
   template la construye por concatenación impredecible, también.

   Uso:
     node scripts/db/check-cascade-drop.mjs              # gate estático (CI)
     node scripts/db/check-cascade-drop.mjs --json       # salida máquina
     node scripts/db/check-cascade-drop.mjs --db         # además, estado REAL
                                                          # (DIRECT_URL/DATABASE_URL)

   Exit codes:
     0  no hay DROP CASCADE con dependencias vivas
     1  hay al menos un DROP CASCADE que rompería policies/funciones
     2  no se pudo analizar (journal/migraciones ilegibles, o --db sin DSN)
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { connectionFor } from "../lib/db-connection.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
export const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
export const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

const IDENT = String.raw`"?[A-Za-z_][\w$]*"?`;

/** `"public"."project_members"` / public.project_members / project_members → project_members. */
export function normalizeIdent(raw) {
  const parts = String(raw)
    .trim()
    .split(".")
    .map((p) => p.trim().replace(/^"|"$/g, ""));
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Divide SQL en sentencias respetando `$$ … $$`, `$tag$ … $tag$`, comillas,
 * y comentarios. Las migraciones de Drizzle separan con
 * `--> statement-breakpoint`, pero hay archivos viejos con varias sentencias
 * separadas sólo por `;` (0027 §0), así que no basta el separador.
 *
 * @param {string} sql
 * @returns {{ text: string, line: number }[]}
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let startLine = 1;
  let line = 1;
  let i = 0;

  const flush = () => {
    const text = buf.trim();
    if (text) out.push({ text, line: startLine });
    buf = "";
  };

  // La línea de inicio es la del primer carácter real de la sentencia, no la
  // del `;` anterior: si no, los comentarios y líneas en blanco entre
  // sentencias desplazan los números y el diagnóstico apunta a otra línea.
  const markStart = () => {
    if (buf.trim() === "") startLine = line;
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Comentario de línea
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    // Comentario de bloque
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        if (sql[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Comilla simple ('' escapa; E'…' usa \')
    if (ch === "'") {
      const escapes = /[eE]$/.test(buf);
      markStart();
      buf += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === "\n") line++;
        if (sql[i] === "'" && sql[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        if (escapes && sql[i] === "\\") {
          buf += sql[i] + (sql[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (sql[i] === "'") break;
        buf += sql[i++];
      }
      buf += "'";
      i++;
      continue;
    }
    // Identificador entre comillas
    if (ch === '"') {
      markStart();
      buf += ch;
      i++;
      while (i < sql.length && sql[i] !== '"') {
        if (sql[i] === "\n") line++;
        buf += sql[i++];
      }
      buf += '"';
      i++;
      continue;
    }
    // Dollar-quote: $$ … $$ o $tag$ … $tag$
    if (ch === "$") {
      const m = /^\$[A-Za-z_][\w$]*\$|^\$\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        const body = sql.slice(i, stop);
        markStart();
        line += (body.match(/\n/g) || []).length;
        buf += body;
        i = stop;
        continue;
      }
    }
    if (ch === ";") {
      flush();
      i++;
      startLine = line;
      continue;
    }
    if (ch === "\n") line++;
    else markStart();
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Quita literales de cadena para no confundir texto con referencias SQL. */
function stripStringLiterals(expr) {
  return expr.replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * ¿La expresión referencia la tabla como relación (FROM/JOIN/UPDATE/INTO/
 * TRUNCATE) o con columna calificada (`project_members.user_id`)? Un simple
 * `\bproject_members\b` daría falsos positivos con nombres de columna.
 *
 * @param {string} expr
 * @param {string} table
 */
export function referencesTable(expr, table) {
  return matchesTableReference(stripStringLiterals(expr), table);
}

/**
 * Igual que `referencesTable` pero SIN quitar literales: para el SQL dinámico
 * (`EXECUTE format('… FROM project_members …')`) la sentencia real vive dentro
 * de la cadena, así que hay que mirarla tal cual.
 */
export function referencesTableInTemplate(expr, table) {
  return matchesTableReference(String(expr), table);
}

function matchesTableReference(expr, table) {
  const sql = String(expr);
  const name = String(table).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const qualified = String.raw`(?:${IDENT}\s*\.\s*)?(?:")?${name}(?:")?`;
  const patterns = [
    // FROM/JOIN con o sin ONLY, LATERAL y alias
    new RegExp(String.raw`\b(?:from|join)\s+(?:only\s+)?(?:lateral\s+)?${qualified}\b`, "i"),
    // Columna calificada: project_members.user_id
    new RegExp(String.raw`\b${qualified}\s*\.`, "i"),
    // UPDATE/INTO/TRUNCATE (por completitud; una policy no debería tenerlos)
    new RegExp(String.raw`\b(?:update|into|truncate)\s+${qualified}\b`, "i"),
  ];
  return patterns.some((re) => re.test(sql));
}

/** Extrae `(expr)` balanceado desde el `(` en `openIndex`. */
function balancedParen(expr, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") {
      depth--;
      if (depth === 0) return expr.slice(openIndex + 1, i);
    }
  }
  return expr.slice(openIndex + 1);
}

/** `USING` y `WITH CHECK` de un CREATE POLICY (fuera de paréntesis anidados). */
function policyPredicates(text) {
  const predicates = [];
  for (const re of [/\bUSING\s*\(/gi, /\bWITH\s+CHECK\s*\(/gi]) {
    let m;
    while ((m = re.exec(text)) !== null) {
      predicates.push(balancedParen(text, m.index + m[0].length - 1));
    }
  }
  return predicates;
}

/**
 * Analiza el estado vivo migración a migración.
 *
 * @param {{ migrationsDir?: string, journalPath?: string }} [opts]
 * @returns {{
 *   ok: boolean,
 *   findings: { migration: string, line: number, table: string, kind: string, object: string, detail: string }[],
 *   notes: string[],
 *   drops: { migration: string, table: string, cascade: boolean, line: number }[],
 *   unjournaled: string[],
 *   unparseable: boolean,
 * }}
 */
export function analyzeCascadeDrops({
  migrationsDir = MIGRATIONS_DIR,
  journalPath = path.join(migrationsDir, "meta", "_journal.json"),
} = {}) {
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const tags = journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);

  const onDisk = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""));
  const inJournal = new Set(tags);
  const unjournaled = onDisk.filter((t) => !inJournal.has(t)).sort();
  const order = [...tags.filter((t) => onDisk.includes(t)), ...unjournaled];

  /** table → Map(policyName → predicates[] + origen) */
  const policies = new Map();
  /** functionName → { body, migration } */
  const functions = new Map();
  /** Policies creadas por SQL dinámico: no se puede resolver su tabla estáticamente. */
  const dynamicTemplates = [];
  /** tablas borradas: para no reportar dos veces el mismo par */
  const findings = [];
  const drops = [];
  const notes = [];
  let unparseable = false;

  const livePolicies = () => {
    const rows = [];
    for (const [table, map] of policies) {
      for (const [name, entry] of map) rows.push({ table, name, ...entry });
    }
    return rows;
  };

  for (const tag of order) {
    const file = `${tag}.sql`;
    let sql;
    try {
      sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    } catch {
      notes.push(`${file}: en journal pero no se pudo leer — se omite`);
      unparseable = true;
      continue;
    }

    for (const { text, line } of splitStatements(sql)) {
      // ── CREATE POLICY ────────────────────────────────────────────────
      const create = text.match(
        new RegExp(
          String.raw`^\s*CREATE\s+POLICY\s+("(?:[^"]|"")+"|${IDENT})\s+ON\s+(${IDENT}(?:\s*\.\s*${IDENT})?)`,
          "i"
        )
      );
      if (create) {
        const name = create[1].replace(/^"|"$/g, "").replace(/""/g, '"');
        const table = normalizeIdent(create[2]);
        if (!policies.has(table)) policies.set(table, new Map());
        policies
          .get(table)
          .set(name, { predicates: policyPredicates(text), migration: file, line });
      }

      // ── ALTER POLICY (no usado hoy; se modela para no quedar ciegos) ──
      const alter = text.match(
        new RegExp(
          String.raw`^\s*ALTER\s+POLICY\s+("(?:[^"]|"")+"|${IDENT})\s+ON\s+(${IDENT}(?:\s*\.\s*${IDENT})?)`,
          "i"
        )
      );
      if (alter) {
        const name = alter[1].replace(/^"|"$/g, "").replace(/""/g, '"');
        const table = normalizeIdent(alter[2]);
        const entry = policies.get(table)?.get(name);
        if (entry) {
          const predicates = policyPredicates(text);
          if (predicates.length) entry.predicates = predicates;
        }
      }

      // ── DROP POLICY ──────────────────────────────────────────────────
      const dropPolicy = text.match(
        new RegExp(
          String.raw`^\s*DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("(?:[^"]|"")+"|${IDENT})\s+ON\s+(${IDENT}(?:\s*\.\s*${IDENT})?)`,
          "i"
        )
      );
      if (dropPolicy) {
        const name = dropPolicy[1].replace(/^"|"$/g, "").replace(/""/g, '"');
        const table = normalizeIdent(dropPolicy[2]);
        policies.get(table)?.delete(name);
      }

      // ── CREATE [OR REPLACE] FUNCTION … AS $$ … $$ ────────────────────
      const createFn = text.match(
        new RegExp(
          String.raw`^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(${IDENT}(?:\s*\.\s*${IDENT})?)`,
          "i"
        )
      );
      if (createFn) {
        const fn = normalizeIdent(createFn[1]);
        functions.set(fn, { body: text, migration: file });
      }

      // ── DROP FUNCTION ────────────────────────────────────────────────
      const dropFn = text.match(
        new RegExp(
          String.raw`^\s*DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(${IDENT}(?:\s*\.\s*${IDENT})?)`,
          "i"
        )
      );
      if (dropFn) functions.delete(normalizeIdent(dropFn[1]));

      // ── SQL dinámico que crea policies (0027) ────────────────────────
      if (/EXECUTE\s+(?:format\s*\(\s*)?'/i.test(text) && /CREATE\s+POLICY/i.test(text)) {
        dynamicTemplates.push({ migration: file, line, text });
      }

      // ── DROP TABLE … [CASCADE] ───────────────────────────────────────
      const dropTable = text.match(
        new RegExp(
          String.raw`^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?((?:${IDENT}\s*\.\s*)?${IDENT}(?:\s*,\s*(?:${IDENT}\s*\.\s*)?${IDENT})*)\s*(CASCADE)?`,
          "i"
        )
      );
      if (!dropTable) continue;

      const tables = dropTable[1].split(",").map((t) => normalizeIdent(t));
      const cascade = Boolean(dropTable[2]);

      for (const table of tables) {
        drops.push({ migration: file, table, cascade, line });

        if (cascade) {
          // Policies de OTRAS tablas que seguirían vivas y leen la tabla.
          for (const p of livePolicies()) {
            if (p.table === table) continue;
            if (p.predicates.some((pred) => referencesTable(pred, table))) {
              findings.push({
                migration: file,
                line,
                table,
                kind: "policy",
                object: `${p.table}.${p.name}`,
                detail: `creada en ${p.migration}:${p.line}; CASCADE la borra y ${p.table} queda con RLS y sin esa policy`,
              });
            }
          }

          // Funciones vivas que leen la tabla (SECURITY DEFINER helper). Se
          // eliminan del estado: CASCADE se las lleva con la tabla.
          for (const [fn, entry] of [...functions]) {
            if (referencesTable(entry.body, table)) {
              findings.push({
                migration: file,
                line,
                table,
                kind: "function",
                object: `public.${fn}()`,
                detail: `definida en ${entry.migration}; CASCADE la elimina y las policies que la llaman fallan en runtime`,
              });
            }
          }

          // SQL dinámico: si el template menciona la tabla, no se puede probar
          // que sea seguro (0027 crea 26 policies por EXECUTE format). Se mira
          // el histórico completo, no solo el archivo que hace el DROP.
          for (const tpl of dynamicTemplates) {
            if (referencesTableInTemplate(tpl.text, table)) {
              findings.push({
                migration: tpl.migration,
                line,
                table,
                kind: "dynamic",
                object: `${tpl.migration}:${tpl.line} (EXECUTE format)`,
                detail: `el SQL dinámico referencia la tabla que ${file} borra: reescríbelo antes del DROP`,
              });
            }
          }
        }

        // Efecto del DROP: la tabla y sus policies desaparecen. En CASCADE,
        // también las policies/funciones dependientes de otras tablas (ya
        // reportadas arriba). Sin CASCADE el DROP fallaría si hubiera
        // dependencias, así que no se asume que desaparezcan.
        for (const [pTable, map] of policies) {
          if (pTable === table) {
            policies.delete(pTable);
            continue;
          }
          if (!cascade) continue;
          for (const [name, entry] of [...map]) {
            if (entry.predicates.some((pred) => referencesTable(pred, table))) map.delete(name);
          }
        }
        if (cascade) {
          for (const [fn, entry] of [...functions]) {
            if (referencesTable(entry.body, table)) functions.delete(fn);
          }
        }
      }
    }
  }

  // Deduplicar (un DROP con varias tablas y policies repetidas puede repetir).
  const seen = new Set();
  const unique = findings.filter((f) => {
    const key = `${f.migration}|${f.table}|${f.kind}|${f.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: unique.length === 0 && !unparseable,
    findings: unique,
    notes,
    drops,
    unjournaled,
    unparseable,
  };
}

/** Texto legible de un hallazgo (compartido por CLI y tests). */
export function formatFinding(f) {
  return `${f.migration}: DROP TABLE ${f.table} CASCADE rompe ${f.kind} ${f.object} — ${f.detail}`;
}

/* ── Verificación contra la BD real (opcional) ──────────────────────────── */
async function checkDatabase(drops, dsn) {
  const pg = await import("pg");
  const client = new pg.default.Client(connectionFor(dsn));
  await client.connect();
  try {
    const problems = [];
    const info = [];
    for (const { table } of drops) {
      const exists = await client.query(
        "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
        [table]
      );
      if (!exists.rowCount) {
        info.push(`${table}: ya no existe en la BD`);
        continue;
      }
      const cols = await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
        [table]
      );
      if (!cols.rowCount) {
        info.push(`${table}: existe pero sin columnas legibles`);
      }
      const pol = await client.query(
        `SELECT tablename, policyname, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
           FROM pg_policies
          WHERE schemaname = 'public'
            AND (coalesce(qual, '') LIKE '%' || $1 || '%'
              OR coalesce(with_check, '') LIKE '%' || $1 || '%')
          ORDER BY tablename, policyname`,
        [table]
      );
      for (const row of pol.rows) {
        if (row.tablename === table) continue;
        problems.push(
          `${table}: la policy ${row.tablename}.${row.policyname} sigue leyéndola en la BD`
        );
      }
      const fns = await client.query(
        `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosrc LIKE '%' || $1 || '%'`,
        [table]
      );
      for (const row of fns.rows) {
        problems.push(`${table}: la función public.${row.proname}() sigue leyéndola en la BD`);
      }
      const [{ n }] = (
        await client
          .query(`SELECT count(*)::int AS n FROM "${table.replace(/"/g, '""')}"`)
          .catch(() => ({
            rows: [{ n: null }],
          }))
      ).rows;
      info.push(
        `${table}: ${pol.rowCount} policy(s) la referencian (incluida la propia); filas=${n ?? "?"}`
      );
    }
    return { problems, info };
  } finally {
    await client.end();
  }
}

/**
 * Permite apuntar a otro directorio de migraciones. Existe como seam de test:
 * los casos de exit 1/2 necesitan un árbol peligroso que el repo no tiene (y no
 * debe tener). Su valor por defecto es el `drizzle/` del repo.
 */
function migrationsDirFromArgs(argv, fallback) {
  const direct = argv.find((a) => a.startsWith("--migrations-dir="));
  if (direct) return path.resolve(direct.slice("--migrations-dir=".length));
  const idx = argv.indexOf("--migrations-dir");
  if (idx !== -1 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return fallback;
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const AS_JSON = process.argv.includes("--json");
  const WITH_DB = process.argv.includes("--db");
  const MIGRATIONS_SOURCE = migrationsDirFromArgs(process.argv, MIGRATIONS_DIR);

  let report;
  try {
    report = analyzeCascadeDrops({ migrationsDir: MIGRATIONS_SOURCE });
  } catch (err) {
    console.error(`❌ No se pudo analizar las migraciones: ${err.message}`);
    process.exit(2);
  }

  let db = null;
  if (WITH_DB) {
    const dsn = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!dsn) {
      console.error("❌ --db requiere DIRECT_URL o DATABASE_URL.");
      process.exit(2);
    }
    try {
      db = await checkDatabase(report.drops, dsn);
    } catch (err) {
      console.error(`❌ No se pudo verificar la BD: ${err.message}`);
      process.exit(2);
    }
  }

  const failed = !report.ok || Boolean(db?.problems.length);

  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, ok: !failed, db }, null, 2));
  } else {
    console.log(
      `\n═══ Guard DROP TABLE … CASCADE (${report.drops.length} DROP, ${report.unjournaled.length} sin journal) ═══`
    );
    for (const d of report.drops) {
      console.log(
        `  ${d.cascade ? "⚠️ " : "✓ "} ${d.migration}:${d.line} DROP TABLE ${d.table}${d.cascade ? " CASCADE" : ""}`
      );
    }
    for (const note of report.notes) console.log(`  · ${note}`);
    if (report.unjournaled.length) {
      console.log(
        `  · migraciones en disco sin entrada en _journal.json: ${report.unjournaled.join(", ")}`
      );
    }
    if (db) {
      for (const i of db.info) console.log(`  BD · ${i}`);
      for (const p of db.problems) console.error(`  BD · ❌ ${p}`);
    }
    if (report.findings.length) {
      console.error("\n❌ DROP CASCADE rompería dependencias vivas:");
      for (const f of report.findings) console.error(`   - ${formatFinding(f)}`);
      console.log(
        "\n💡 Solución: recrea esas policies/funciones sin la referencia ANTES del DROP " +
          "(patrón de drizzle/0052_remove_project_members.sql), o usa DROP TABLE sin CASCADE."
      );
    } else if (report.unparseable) {
      console.log("\n⚠️  Análisis incompleto: hay migraciones ilegibles (ver notas).");
    } else {
      console.log(
        "\n✅ DROP CASCADE guard: OK — ningún DROP deja policies/funciones vivas apuntando a la tabla."
      );
    }
  }

  process.exit(failed ? 1 : report.unparseable ? 2 : 0);
}
