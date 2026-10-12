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
// Fuente única de la politica: la comparten el auditor y la purga.
import {
  PATTERNS,
  KEEP,
  DEMO_PROJECT_PATTERNS,
  PLACEHOLDER_PROJECT_NAMES,
  PROJECT_SCOPED_FK,
  PROJECT_SCOPED_TABLES,
  PROJECT_SCOPED_CASCADE_TABLES,
} from "../lib/fake-data-patterns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Mismo patrón que `scripts/manual/backup-manager.ts:6-8`: sólo se LEE.
// `quiet` es obligatorio: dotenv@17 imprime un banner a STDOUT y corrompería el
// informe `--json` cuando se redirige a un fichero (`> backups/baseline.json`).
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });

// PATTERNS / KEEP / DEMO_PROJECT_PATTERNS / PROJECT_SCOPED_* viven ahora en
// `scripts/lib/fake-data-patterns.mjs`, porque la purga necesita exactamente los
// mismos. Duplicarlos ya nos costó una clase entera de bugs.
//
// El auditor aplica LA MISMA política que la purga (patrón + regla
// project-scoped: FK directa y cierre por `ON DELETE CASCADE`), así que el
// `DELETE` que informa aquí es exactamente el conjunto que la purga borra. Si
// divergieran, la Fase 1 podría cerrar con un `DELETE>0` invisible para la
// purga (o al revés).

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
    [table]
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
    [table]
  );
  return res.rows.map((r) => r.column_name);
}

/**
 * Hijos de `table` por una FK de UNA columna con `ON DELETE CASCADE`. Es el
 * mismo predicado que usa la purga para su cierre: una FK compuesta no permite
 * atribuir la fila hija con una sola columna y se queda fuera (la reportaría el
 * gate de dependencias de la purga como cascada no aceptada).
 */
async function cascadeChildFks(pool, table) {
  const res = await roQuery(
    pool,
    `SELECT cl.relname AS child, a.attname AS col
     FROM pg_constraint f
     JOIN pg_class cl ON cl.oid = f.conrelid
     JOIN pg_class pl ON pl.oid = f.confrelid
     JOIN pg_namespace n ON n.oid = pl.relnamespace
     JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = f.conkey[1]
     WHERE f.contype = 'f' AND pl.relname = $1 AND n.nspname = 'public'
       AND cl.relname <> $1 AND f.confdeltype = 'c' AND array_length(f.conkey, 1) = 1
     ORDER BY 1`,
    [table]
  );
  return res.rows;
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
    params
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
    acc[c] = NAME_LOOKS_SECRET.test(c)
      ? "[REDACTADO: nombre de columna sensible]"
      : text.slice(0, SAMPLE_MAX);
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
      console.warn(
        "AVISO: el servidor no confirma transaction_read_only=on; el script sigue emitiendo sólo SELECT."
      );
    }

    const tablesRes = await roQuery(
      pool,
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const tables = tablesRes.rows
      .map((r) => r.tablename)
      .filter((t) => !SKIP_TABLES.test(t))
      .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

    const missing = onlyTables.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      console.warn(`AVISO: tablas solicitadas que no existen en public: ${missing.join(", ")}`);
    }

    // 1) Proyectos demo/fixture (origen del que cuelgan las filas sin patrón
    //    propio). Dos vías: los patrones de texto (`DEMO_PROJECT_PATTERNS`) y la
    //    lista de NOMBRES EXACTOS decidida por el operador en P0.5
    //    (`PLACEHOLDER_PROJECT_NAMES`); el porqué de la igualdad exacta está en
    //    ese módulo.
    const projectCols = await textColumns(pool, "projects");
    const demoRowsByPattern = await selectMatches(
      pool,
      "projects",
      projectCols,
      [{ id: "demo-project", kind: "DELETE", find: DEMO_PROJECT_PATTERNS }],
      200
    );
    const demoRowsByName = (
      await roQuery(
        pool,
        `SELECT to_jsonb(t) AS row FROM "public"."projects" t WHERE lower(t.name) = ANY($1::text[])`,
        [PLACEHOLDER_PROJECT_NAMES.map((n) => n.toLowerCase())]
      )
    ).rows.map((r) => r.row);
    const demoRows = [...demoRowsByPattern];
    const demoSeen = new Set(demoRows.map((r) => r.id));
    for (const r of demoRowsByName) {
      if (r.id && !demoSeen.has(r.id)) {
        demoSeen.add(r.id);
        demoRows.push(r);
      }
    }
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

    // 2b) Los PROYECTOS placeholder son candidatos POR SÍ MISMOS, no sólo por
    //     las filas que cuelgan de ellos. En Fase 1 coincidían además con un
    //     PATTERN de texto y el barrido ya los capturaba; los de P0.5 sólo se
    //     identifican por nombre (ver `PLACEHOLDER_PROJECT_NAMES`), así que sin
    //     esto se enumerarían sus hijos pero no el padre. Dedup por PK: una fila
    //     que ya salió por patrón no se cuenta dos veces.
    const seenKeys = new Set(findings.map((f) => `${f.table}|${JSON.stringify(f.pk)}`));
    const projectPk = await primaryKey(pool, "projects");
    for (const row of demoRows) {
      const pkValue = Object.fromEntries(projectPk.map((c) => [c, row[c]]));
      const key = `projects|${JSON.stringify(pkValue)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const blob = JSON.stringify(row).toLowerCase();
      if (KEEP.some((k) => blob.includes(k.toLowerCase()))) continue;
      findings.push({
        table: "projects",
        kind: "DELETE",
        patterns: ["DELETE:placeholder-project"],
        pk: pkValue,
        matched: { name: String(row.name ?? "") },
      });
    }

    // 2c) Huérfanos INVERSOS: filas de `public.users` sin identidad en
    //     `auth.users`. El usuario legítimo siempre tiene login; una fila sin él
    //     es un residuo (hoy: el bypass de desarrollo `dev@localhost.dev`). Es
    //     una comprobación de integridad general, no un patrón de texto: se
    //     añade sólo si la fila no había salido ya por `synthetic-user`.
    const userPk = await primaryKey(pool, "users");
    const orphanRows = (
      await roQuery(
        pool,
        `SELECT to_jsonb(t) AS row FROM "public"."users" t
          WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.id)`
      )
    ).rows.map((r) => r.row);
    for (const row of orphanRows) {
      const pkValue = Object.fromEntries(userPk.map((c) => [c, row[c]]));
      const key = `users|${JSON.stringify(pkValue)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const blob = JSON.stringify(row).toLowerCase();
      if (KEEP.some((k) => blob.includes(k.toLowerCase()))) continue;
      findings.push({
        table: "users",
        kind: "DELETE",
        patterns: ["DELETE:orphan-inverse"],
        pk: pkValue,
        matched: { email: String(row.email ?? "") },
      });
    }

    // 3) D1-3/D4 — regla «project-scoped»: filas sin patrón de texto propio que
    //    pertenecen a un proyecto demo. Dos vías, la MISMA política que la purga:
    //      · directa: FK de una columna `project_id` hacia `projects`.
    //      · cierre : hijo de una fila candidata por `ON DELETE CASCADE`.
    //    La clave es la PK: una fila que ya salió por patrón no se cuenta dos
    //    veces, así el `DELETE` del auditor coincide con la unión de la purga.
    const candidateIds = new Map(); // tabla → ids de filas candidatas (DELETE)
    const remember = (table, pkValue) => {
      const first = Object.keys(pkValue)[0];
      if (!first) return;
      if (!candidateIds.has(table)) candidateIds.set(table, new Set());
      candidateIds.get(table).add(String(pkValue[first]));
    };
    // Sólo los DELETE pueden ser padres del cierre: un REVIEW no se borra, así
    // que su hijo tampoco entra en el conjunto a purgar.
    for (const f of findings) if (f.kind === "DELETE") remember(f.table, f.pk);

    const pkCache = new Map();
    const pkOf = async (table) => {
      if (!pkCache.has(table)) pkCache.set(table, await primaryKey(pool, table));
      return pkCache.get(table);
    };
    const addScoped = async (table, fkCol, source, rows) => {
      if (rows.length > 0 && !scanned.includes(table)) scanned.push(table);
      const pk = rows.length > 0 ? await pkOf(table) : [];
      for (const row of rows) {
        const pkValue = Object.fromEntries(pk.map((c) => [c, row[c]]));
        const key = `${table}|${JSON.stringify(pkValue)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        remember(table, pkValue);
        // Allowlist operativa: aquí es más fuerte que en el barrido por patrón
        // (la purga se salta estas filas siempre; ver Task 3 del plan).
        const blob = JSON.stringify(row).toLowerCase();
        if (KEEP.some((k) => blob.includes(k.toLowerCase()))) continue;
        findings.push({
          table,
          kind: "DELETE",
          patterns: [`DELETE:${source}`],
          pk: pkValue,
          matched: { [fkCol]: String(row[fkCol]) },
        });
      }
    };

    if (demoIds.length > 0) {
      for (const table of [...PROJECT_SCOPED_TABLES].sort()) {
        if (onlyTables.length > 0 && !onlyTables.includes(table)) continue;
        if ((await pkOf(table)).length === 0) {
          console.warn(`AVISO: ${table} sin PK; la purga no puede tratarla por project-scoped.`);
          continue;
        }
        const res = await roQuery(
          pool,
          `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t
           WHERE ${quoteIdent(PROJECT_SCOPED_FK)} = ANY($1::uuid[])`,
          [demoIds]
        );
        await addScoped(
          table,
          PROJECT_SCOPED_FK,
          "demo-project-fk",
          res.rows.map((r) => r.row)
        );
      }
    }

    // 4) Cierre por CASCADE. Los padres se congelan ANTES del bucle
    //    (`[...candidateIds]`): un solo nivel, igual que la purga — los hijos de
    //    un hijo tendrían que declararse en `PROJECT_SCOPED_CASCADE_TABLES`.
    const cascadeTables = new Set();
    for (const [parent, ids] of [...candidateIds]) {
      if (ids.size === 0) continue;
      for (const fk of await cascadeChildFks(pool, parent)) {
        if (onlyTables.length > 0 && !onlyTables.includes(fk.child)) continue;
        const pk = await pkOf(fk.child);
        if (pk.length === 0) {
          console.warn(`AVISO: ${fk.child} sin PK; el cierre por CASCADE no puede enumerarla.`);
          continue;
        }
        const res = await roQuery(
          pool,
          `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(fk.child)} t
           WHERE ${quoteIdent(fk.col)}::text = ANY($1::text[])`,
          [[...ids]]
        );
        const before = findings.length;
        await addScoped(
          fk.child,
          fk.col,
          "cascade-child",
          res.rows.map((r) => r.row)
        );
        if (findings.length > before) cascadeTables.add(fk.child);
      }
    }

    const count = (k) => findings.filter((f) => f.kind === k).length;
    const byTable = {};
    for (const f of findings) byTable[f.table] = (byTable[f.table] || 0) + 1;

    // Una tabla que aparece por el cierre y NO está declarada es una tabla nueva
    // con `ON DELETE CASCADE` hacia una fila candidata: la purga se niega a
    // aplicarlo hasta declararla (diff `declaredProjectScoped.notDeclaredCascade`).
    const notDeclaredCascade = [...cascadeTables]
      .filter((t) => !PROJECT_SCOPED_TABLES.has(t) && !PROJECT_SCOPED_CASCADE_TABLES.has(t))
      .sort();

    const report = {
      generatedAt: new Date().toISOString(),
      url: projectLabel(url),
      readOnlyEnforced,
      tablesScanned: scanned.length,
      projectsDemo: demoIds.length,
      orphanInverse: orphanRows.length,
      delete: count("DELETE"),
      review: count("REVIEW"),
      byTable,
      notDeclaredCascade,
      findings,
    };

    if (jsonOut) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      out(`Auditoría de datos falsos — ${report.generatedAt}`);
      out(
        `BD: ${report.url} · tablas escaneadas: ${report.tablesScanned} · proyectos demo: ${report.projectsDemo}`
      );
      out(
        `DELETE=${report.delete}  REVIEW=${report.review}  huérfanos-inversos=${report.orphanInverse}`
      );
      // Agrupado por tabla: una tabla demo con miles de filas (`uptime_logs`)
      // convertiría el informe en un volcado. El detalle completo va en --json.
      const LIST_MAX = 10;
      const grouped = new Map();
      for (const f of findings) {
        if (!grouped.has(f.table)) grouped.set(f.table, []);
        grouped.get(f.table).push(f);
      }
      for (const [table, rows] of [...grouped].sort()) {
        const kinds = [...new Set(rows.map((r) => r.kind))].join("/");
        const pats = [...new Set(rows.flatMap((r) => r.patterns))].join(", ");
        out(`  [${kinds}] ${table} × ${rows.length}  <- ${pats}`);
        for (const f of rows.slice(0, LIST_MAX)) {
          out(`           pk=${JSON.stringify(f.pk)} matched=${JSON.stringify(f.matched)}`);
        }
        if (rows.length > LIST_MAX) {
          out(`           … y ${rows.length - LIST_MAX} fila(s) más (detalle en --json)`);
        }
      }
      if (report.notDeclaredCascade.length > 0) {
        out(
          `AVISO: tablas alcanzadas por el cierre CASCADE y NO declaradas en la política: ${report.notDeclaredCascade.join(", ")}`
        );
      }
      out(
        report.delete === 0
          ? "RESULTADO: sin basura DELETE."
          : "RESULTADO: hay basura DELETE pendiente."
      );
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
