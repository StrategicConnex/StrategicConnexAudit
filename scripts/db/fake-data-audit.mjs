#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Auditor de datos falsos en la BD (SOLO LECTURA).

   Escanea las tablas de `public` buscando los patrones de datos inventados
   catalogados en `docs/superpowers/plans/2026-10-06-eliminar-datos-falsos.md`
   (Task 1) y clasifica cada fila:

     DELETE — basura segura (la purga la hará `scripts/db/fake-data-purge.mjs`)
     REVIEW — ambigua; requiere decisión humana
     KEEP   — excepción operativa (usuario del smoke E2E)

   POR QUÉ SE PUEDE CORRER CONTRA PRODUCCIÓN:
     1. La sesión Postgres se abre en READ ONLY: aunque el código cambiara, es
        el servidor quien rechaza cualquier escritura.
     2. El informe NO vuelca la fila completa: guarda la PK y sólo las columnas
        que contienen el patrón (truncadas), redactando las que parecen
        secretas. Ni los logs ni el artefacto de CI arrastran hashes, tokens
        ni PII ajena al hallazgo.
     3. Sólo se emiten `SELECT`, `information_schema` y `pg_catalog`.

   Uso:
     node scripts/db/fake-data-audit.mjs                  # informe; exit 1 si hay DELETE
     node scripts/db/fake-data-audit.mjs --json
     node scripts/db/fake-data-audit.mjs --no-fail        # informe sin fallar
     node scripts/db/fake-data-audit.mjs --tables projects,users
     node scripts/db/fake-data-audit.mjs --fail-on-error  # explícito (CI)

   Convención de exit: 0 = limpio (o sólo KEEP/REVIEW), 1 = hay DELETE
   pendiente, 2 = error de ejecución (BD inaccesible, etc.).
   ═══════════════════════════════════════════════════════════════════════ */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Mismo patrón que `scripts/manual/backup-manager.ts:6-8`: sólo se LEE.
// `quiet` es obligatorio: dotenv@17 imprime un banner a STDOUT y corrompería el
// informe `--json` cuando se redirige a un fichero (`> backups/baseline.json`).
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });

/**
 * Patrones globales: se aplican a TODAS las tablas de `public`.
 * D1-1 (2026-10-10): el proyecto `Pipeline Test - strategicconnex.com.ar` pasó
 * de REVIEW a DELETE por decisión del operador.
 */
const PATTERNS = [
  { id: "demo-domain", kind: "DELETE", find: ["example.com", "example.org", "example.net"] },
  { id: "seed-fake-email", kind: "DELETE", find: ["client@company.com", "usera_", "userb_"] },
  { id: "fake-registrar", kind: "DELETE", find: ["ICANN Registrar Corp"] },
  { id: "fake-ip-testnet", kind: "DELETE", find: ["203.0.113."] },
  { id: "sim-marker", kind: "DELETE", find: ["[SIM]"] },
  { id: "fake-cohosted", kind: "DELETE", find: ["site1.", ".domain.net"] },
  { id: "seed-competitor", kind: "DELETE", find: ["competitor1.com"] },
  { id: "seed-pipeline", kind: "DELETE", find: ["pipeline test"] },
  { id: "ambiguous-admin", kind: "REVIEW", find: ["admin@strategicaudit.pro"] },
];

/** Excepciones que NUNCA se reportan como hallazgo (operativas). */
const KEEP = ["smoke-test@strategicconnex.test"];

/** Patrones que identifican un "proyecto demo", destino de la purga. */
const DEMO_PROJECT_PATTERNS = ["example.com", "example.org", "example.net", "pipeline test"];

/**
 * D1-3 (2026-10-10): tablas cuyas filas no tienen patrón de texto propio y sólo
 * se pueden atribuir a un proyecto demo por su FK. Se reportan como DELETE con
 * el patrón sintético `DELETE:demo-project-fk`.
 */
const PROJECT_SCOPED = { exec_briefs: "project_id" };

/** Columnas cuyo valor no se imprime ni truncado (defensa en profundidad). */
const NAME_LOOKS_SECRET = /(pass|secret|token|key|hash|credential|refresh|session|cookie)/i;

const SAMPLE_MAX = 120;
const ROWS_PER_TABLE = 50;
const SKIP_TABLES = /^(drizzle_|pg_|_)/;
const TEXT_TYPES = new Set(["text", "character varying", "json", "jsonb", "xml"]);

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name) => args.includes(name);
const jsonOut = has("--json");
const noFail = has("--no-fail");
const failOnError = has("--fail-on-error") || !noFail;
const onlyTables = (arg("--tables") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const out = (line) => {
  if (!jsonOut) console.log(line);
};

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Proyecto Supabase del DSN — sin exponer credenciales ni la URL completa. */
function projectLabel(url) {
  const m = url.match(/@(?:db\.)?([a-z0-9]+)\.supabase\.co/);
  return m ? `supabase:${m[1]}` : "postgres:externo";
}

/**
 * Toda lectura va en una transacción `READ ONLY`: no es una promesa del script,
 * la impone el servidor (una escritura fallaría con "cannot execute ... in a
 * read-only transaction"). Es lo que hace segura esta herramienta contra prod.
 */
async function roQuery(pool, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Columnas de texto de una tabla (donde puede vivir un patrón). */
async function textColumns(pool, table) {
  const res = await roQuery(
    pool,
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return res.rows.filter((c) => TEXT_TYPES.has(c.data_type)).map((c) => c.column_name);
}

/** Columnas de la PK, en orden (sin PK no hay forma segura de purgar). */
async function primaryKey(pool, table) {
  const res = await roQuery(
    pool,
    `SELECT kcu.column_name FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table],
  );
  return res.rows.map((r) => r.column_name);
}

/**
 * Filas de `table` con algún fragmento dentro de alguna columna de texto.
 * `strpos` parametrizado: evita todo problema de escapado de `ILIKE` y el
 * identificador va entrecomillado, así que columnas tipo `"user"` o `"Key"`
 * no rompen la consulta.
 */
async function selectMatches(pool, table, cols, patterns, limit) {
  const params = [];
  const ors = [];
  for (const p of patterns) {
    for (const f of p.find) {
      params.push(f.toLowerCase());
      const ph = `$${params.length}`;
      ors.push(cols.map((c) => `strpos(lower(${quoteIdent(c)}::text), ${ph}) > 0`).join(" OR "));
    }
  }
  if (ors.length === 0) return [];
  const res = await roQuery(
    pool,
    `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t
     WHERE (${ors.join(" OR ")}) LIMIT ${Number(limit)}`,
    params,
  );
  return res.rows.map((r) => r.row);
}

const ALL_FRAGMENTS = PATTERNS.flatMap((p) => p.find.map((f) => f.toLowerCase()));

/** Valores de las columnas que contienen el patrón — truncados y redactados. */
function matchedColumns(cols, row) {
  const acc = {};
  for (const c of cols) {
    const raw = row[c];
    if (raw === null || raw === undefined) continue;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (!ALL_FRAGMENTS.some((f) => text.toLowerCase().includes(f))) continue;
    acc[c] = NAME_LOOKS_SECRET.test(c) ? "[REDACTADO: nombre de columna sensible]" : text.slice(0, SAMPLE_MAX);
  }
  return acc;
}

/** Clasifica una fila; devuelve `null` si no es hallazgo. */
function classify(table, pk, cols, row, extraPatterns = [], extraMatched = {}) {
  const blob = JSON.stringify(row).toLowerCase();
  const matched = PATTERNS.filter((p) => p.find.some((f) => blob.includes(f.toLowerCase())));
  if (matched.length === 0 && extraPatterns.length === 0) return null;

  const isDelete = matched.some((p) => p.kind === "DELETE") || extraPatterns.length > 0;
  // Excepción operativa: sólo se respeta si la fila NO trae basura DELETE.
  if (KEEP.some((k) => blob.includes(k.toLowerCase())) && !isDelete) return null;

  const pkValue = {};
  for (const c of pk) pkValue[c] = row[c];

  return {
    table,
    kind: isDelete ? "DELETE" : "REVIEW",
    patterns: [...matched.map((p) => `${p.kind}:${p.id}`), ...extraPatterns],
    pk: pkValue,
    matched: { ...matchedColumns(cols, row), ...extraMatched },
  };
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL/DIRECT_URL no encontrada en .env.local");
    process.exit(2);
  }

  // SSL: política única en `scripts/lib/db-connection.mjs` (el `sslmode` del
  // DSN se retira para que pg 8.20 no pueda pisar el objeto `ssl`; `disable`
  // → sin TLS). Ver el comentario de ese módulo: aquí vivía la primera copia
  // de este arreglo y hay un guard de regresión en
  // `tests/security/db-connection-ssl.test.ts`.
  const pool = new pg.Pool({ ...connectionFor(url), max: 2 });

  try {
    // Auto-test del blindaje (evidencia, no suposición): dentro de la
    // transacción READ ONLY el propio servidor confirma el modo.
    const probe = await roQuery(pool, "SHOW transaction_read_only");
    const readOnlyEnforced = probe.rows[0]?.transaction_read_only === "on";
    if (!readOnlyEnforced) {
      console.warn("AVISO: el servidor no confirma transaction_read_only=on; el script sigue emitiendo sólo SELECT.");
    }

    const tablesRes = await roQuery(
      pool,
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = tablesRes.rows
      .map((r) => r.tablename)
      .filter((t) => !SKIP_TABLES.test(t))
      .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

    const missing = onlyTables.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      console.warn(`AVISO: tablas solicitadas que no existen en public: ${missing.join(", ")}`);
    }

    // 1) Proyectos demo (origen del que cuelgan las filas sin patrón propio).
    const demoRows = await selectMatches(
      pool,
      "projects",
      await textColumns(pool, "projects"),
      [{ id: "demo-project", kind: "DELETE", find: DEMO_PROJECT_PATTERNS }],
      200,
    );
    const demoIds = demoRows.map((r) => r.id).filter(Boolean);

    // 2) Barrido por patrones de texto.
    const findings = [];
    const scanned = [];
    for (const table of tables) {
      const cols = await textColumns(pool, table);
      if (cols.length === 0) continue;
      const pk = await primaryKey(pool, table);
      const rows = await selectMatches(pool, table, cols, PATTERNS, ROWS_PER_TABLE);
      scanned.push(table);
      for (const row of rows) {
        const f = classify(table, pk, cols, row);
        if (f) findings.push(f);
      }
    }

    // 3) D1-3: filas sin patrón propio, atribuidas por FK al proyecto demo.
    for (const [table, fk] of Object.entries(PROJECT_SCOPED)) {
      if (onlyTables.length > 0 && !onlyTables.includes(table)) continue;
      if (demoIds.length === 0) break;
      const cols = await textColumns(pool, table);
      if (cols.length === 0) continue;
      const pk = await primaryKey(pool, table);
      if (pk.length === 0) continue;
      const res = await roQuery(
        pool,
        `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t
         WHERE ${quoteIdent(fk)} = ANY($1::uuid[]) LIMIT ${ROWS_PER_TABLE}`,
        [demoIds],
      );
      if (res.rows.length > 0 && !scanned.includes(table)) scanned.push(table);
      for (const r of res.rows) {
        const row = r.row;
        findings.push({
          table,
          kind: "DELETE",
          patterns: ["DELETE:demo-project-fk"],
          pk: Object.fromEntries(pk.map((c) => [c, row[c]])),
          matched: { [fk]: String(row[fk]) },
        });
      }
    }

    const count = (k) => findings.filter((f) => f.kind === k).length;
    const byTable = {};
    for (const f of findings) byTable[f.table] = (byTable[f.table] || 0) + 1;

    const report = {
      generatedAt: new Date().toISOString(),
      url: projectLabel(url),
      readOnlyEnforced,
      tablesScanned: scanned.length,
      projectsDemo: demoIds.length,
      delete: count("DELETE"),
      review: count("REVIEW"),
      byTable,
      findings,
    };

    if (jsonOut) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      out(`Auditoría de datos falsos — ${report.generatedAt}`);
      out(`BD: ${report.url} · tablas escaneadas: ${report.tablesScanned} · proyectos demo: ${report.projectsDemo}`);
      out(`DELETE=${report.delete}  REVIEW=${report.review}`);
      for (const f of findings) {
        out(`  [${f.kind}] ${f.table} <- ${f.patterns.join(", ")}`);
        out(`           pk=${JSON.stringify(f.pk)} matched=${JSON.stringify(f.matched)}`);
      }
      out(report.delete === 0 ? "RESULTADO: sin basura DELETE." : "RESULTADO: hay basura DELETE pendiente.");
    }

    await pool.end();
    process.exit(report.delete > 0 && failOnError ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err.message);
    await pool.end().catch(() => {});
    process.exit(2);
  }
}

main();
