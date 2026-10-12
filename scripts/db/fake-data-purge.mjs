#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Purga de datos falsos de la BD. DRY-RUN POR DEFECTO.

   Uso:
     node scripts/db/fake-data-purge.mjs                        # dry-run
     node scripts/db/fake-data-purge.mjs --json                 # dry-run, informe
     node scripts/db/fake-data-purge.mjs --tables users,projects
     node scripts/db/fake-data-purge.mjs --apply --accept-cascade --confirm AAAA-MM-DD

   GARANTÍAS (en este orden; si una falla, NO se escribe nada):

     1. DRY-RUN por defecto. Escribir exige `--apply` **y** `--confirm <hoy>`
        (la fecha se comprueba, no se cree: evita el `--apply` de copia-pega).
     2. Sólo `DELETE` con `WHERE` explícito sobre PKs sacadas de la propia fila,
        y sólo en tablas del allowlist: `PURGE_TABLES` (barrido por patrón) más
        `PROJECT_SCOPED_TABLES` (filas hijas de un proyecto demo; garantía 8).
        Nunca `TRUNCATE`, nunca `DROP`, nunca `UPDATE`. Lo que no está en el
        allowlist se informa, no se toca.
     3. RECUENTO: los candidatos se comparan, por separado, con `PURGE_EXPECTED`
        (barrido por patrón) y `PURGE_EXPECTED_PROJECT_SCOPED` (regla
        project-scoped). Desviación >5% en una tabla o en un total ⇒ el `--apply`
        se ABORTA (el dry-run sale con exit 1). Un recuento que no cuadra es un
        hecho nuevo, no ruido: se investiga y se actualiza el esperado, no se
        ignora. También cuenta el TOPE de filas por tabla: una tabla con
        exactamente `ROWS_PER_TABLE` filas puede tener más basura sin listar y
        se avisa en vez de darlo por bueno.
     4. DEPENDENCIAS: antes de borrar se analiza el grafo de FK contra TODAS las
        tablas de `public`, y se separan tres clases:
        · RESTRICT/NO ACTION sobre filas que NO son candidatas → el `DELETE`
          fallaría. **Nunca se acepta**: se resuelve ampliando el alcance (o se
          deja esa tabla fuera), porque "fallar a medias" no es una opción.
        · CASCADE sobre filas que NO son candidatas → borrado silencioso de
          datos que la purga no apuntaba. **Aborta por defecto**; sólo se
          acepta con `--accept-cascade` explícito, que lista exactamente qué se
          lleva por delante. Sin este gate, `projects.owner_id ON DELETE
          CASCADE` habría borrado 7 proyectos ajenos al allowlist "con éxito".
        · SET NULL → mutación (no borrado) de filas no candidatas: se informa
          como aviso; es la conducta que el schema pidió al declarar la FK.
     5. UNA transacción (`BEGIN … COMMIT`); cualquier error ⇒ `ROLLBACK` total.
     6. Snapshot de las filas a borrar en `backups/fake-data-purge-<ts>.json`
        (restauración manual) ANTES de tocar nada.
     7. `public.users` y `auth.users` son tablas DISTINTAS: este script NO borra
        identidades de `auth.users` — eso es una operación de cuenta, no una
        limpieza de datos. Las identidades que sí existen se INFORMAN para que se
        retiren a mano si procede.
     8. REGLA «PROJECT-SCOPED» (decisión del operador, 2026-10-11): hay filas
        basura que no llevan ningún patrón de texto propio (`uptime_logs`,
        `audit_logs`, `reports`, `intelligence_usage_events`…) y que un barrido
        por patrones deja atrás; peor, dejan el `DELETE` del proyecto retenido
        por una FK `NO ACTION`. Toda tabla con una FK de una columna `project_id`
        hacia `projects` se purga POR PROYECTO, y sólo para los proyectos que
        son candidatos. El conjunto de tablas está DECLARADO en
        `PROJECT_SCOPED_TABLES` y la purga lo compara con el que descubre en la
        BD: si alguien añade una tabla con `project_id`, aparece como diferencia
        y el `--apply` se rechaza hasta declararla a conciencia.

   Códigos de salida: 0 = limpio · 1 = dry-run con bloqueos o desviación de
   recuento (nada escrito) · 2 = error de ejecución o aplicación rechazada.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";
import {
  PATTERNS,
  DEMO_PROJECT_PATTERNS,
  PLACEHOLDER_PROJECT_NAMES,
  KEEP,
  PURGE_TABLES,
  PURGE_EXPECTED,
  PURGE_EXPECTED_TOTAL,
  PROJECT_SCOPED_FK,
  PROJECT_SCOPED_TABLES,
  PROJECT_SCOPED_CASCADE_TABLES,
  PURGE_EXPECTED_PROJECT_SCOPED,
  CASCADE_ACCEPTED,
} from "../lib/fake-data-patterns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(ROOT, ".env.local"), quiet: true });

/** Tope de filas examinadas por tabla (el auditor usa el mismo). */
const ROWS_PER_TABLE = 500;
const TEXT_TYPES = new Set(["text", "character varying", "json", "jsonb", "xml"]);
/** Tolerancia del gate de recuento (5%, pedida por el operador). */
const DRIFT_TOLERANCE = 0.05;
/** Filas de `users` que NUNCA se borran (credencial del gate de smoke). */
const KEEP_ROWS = KEEP.map((email) => ({ table: "users", match: email }));

/**
 * Guarda de configuración: los recuentos declarados deben corresponder a tablas
 * que la purga puede borrar de verdad. Sin esto, un esperado mal puesto (o una
 * tabla que sale del allowlist) se convierte en un `⚠️` de recuento que se
 * aprende a ignorar.
 */
function assertPolicyCoherent() {
  const patternOut = Object.keys(PURGE_EXPECTED).filter((t) => !PURGE_TABLES.has(t));
  if (patternOut.length > 0) {
    throw new Error(
      `PURGE_EXPECTED declara tablas fuera de PURGE_TABLES (nunca podrían tener candidatos): ${patternOut.join(", ")}`
    );
  }
  const scopedOk = (t) => PROJECT_SCOPED_TABLES.has(t) || PROJECT_SCOPED_CASCADE_TABLES.has(t);
  const scopedOut = Object.keys(PURGE_EXPECTED_PROJECT_SCOPED).filter((t) => !scopedOk(t));
  if (scopedOut.length > 0) {
    throw new Error(
      `PURGE_EXPECTED_PROJECT_SCOPED declara tablas fuera de la regla project-scoped: ${scopedOut.join(", ")}`
    );
  }
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const apply = args.includes("--apply");
const asJson = args.includes("--json");
/** Acepta el borrado en cascada de filas no candidatas. Explícito, nunca por defecto. */
const acceptCascade = args.includes("--accept-cascade");
const confirm = arg("--confirm");
const onlyTables = (arg("--tables") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/**
 * Fecha de HOY en el reloj local del operador, no en UTC. El gate existe para
 * que nadie ejecute un `--apply` copiado de ayer: si `today()` fuera UTC y el
 * operador está en UTC−3, cualquier intento después de las 21:00 locales
 * fallaría siempre con "--confirm es obligatorio" aunque la fecha fuera la
 * correcta (y el plan documenta el comando con la fecha local: `Get-Date`).
 */
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;
const line = (s) => {
  if (!asJson) console.log(s);
};
/** Progreso por STDERR: no contamina el stdout de `--json` y se ve si algo tarda. */
const progress = (s) => {
  if (!asJson) process.stderr.write(`   … ${s}\n`);
};

/** Proyecto Supabase del DSN — sin exponer credenciales ni la URL completa. */
function projectLabel(url) {
  const m = url.match(/@(?:db\.)?([a-z0-9]+)\.supabase\.co/);
  return m ? `supabase:${m[1]}` : "postgres:externo";
}

// ── Introspección (sólo lectura) ────────────────────────────────────────
async function textColumns(client, table) {
  const res = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.filter((c) => TEXT_TYPES.has(c.data_type)).map((c) => c.column_name);
}

async function primaryKey(client, table) {
  const res = await client.query(
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

/** Filas de `table` con algún fragmento de PATTERNS en alguna columna de texto. */
async function selectMatches(client, table, cols, patterns = PATTERNS) {
  const params = [];
  const ors = [];
  for (const p of patterns) {
    for (const f of p.find) {
      params.push(f.toLowerCase());
      const ph = `$${params.length}`;
      ors.push(cols.map((c) => `strpos(lower(${quoteIdent(c)}::text), ${ph}) > 0`).join(" OR "));
    }
  }
  const res = await client.query(
    `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t
     WHERE (${ors.join(" OR ")}) LIMIT ${ROWS_PER_TABLE}`,
    params
  );
  return res.rows.map((r) => r.row);
}

/** FKs que apuntan a `table`, con su regla de borrado. */
async function inboundFks(client, table) {
  const res = await client.query(
    `SELECT cl.relname AS child, a.attname AS col, f.confdeltype AS rule
     FROM pg_constraint f
     JOIN pg_class cl ON cl.oid = f.conrelid
     JOIN pg_class pl ON pl.oid = f.confrelid
     JOIN pg_namespace n ON n.oid = pl.relnamespace
     JOIN unnest(f.conkey) AS k(colnum) ON true
     JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.colnum
     WHERE f.contype = 'f' AND pl.relname = $1 AND n.nspname = 'public'
       AND cl.relname <> $1
     ORDER BY 1`,
    [table]
  );
  return res.rows;
}

// Códigos de `pg_constraint.confdeltype` (PostgreSQL):
//   a = NO ACTION · r = RESTRICT · c = CASCADE · n = SET NULL · d = SET DEFAULT
// Estaban mal mapeados (`n`→NO ACTION, `a`→SET DEFAULT): un `ON DELETE SET NULL`
// —la conducta que el schema pidió al declarar la FK— se trataba como BLOQUEO
// DURO, y un `SET DEFAULT` se colaba como simple aviso. Verificado contra
// audit_logs.user_id (def `ON DELETE SET NULL`, `confdeltype='n'`).
const RULE = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

/**
 * Tablas que la BD tiene como project-scoped (FK de una columna `project_id`
 * hacia `projects`). Se descubren para poder compararlas con las declaradas en
 * la política: una tabla nueva debe declararse a conciencia, no colarse.
 */
async function discoveredProjectScoped(client) {
  const res = await client.query(
    `SELECT cl.relname AS child
     FROM pg_constraint f
     JOIN pg_class cl ON cl.oid = f.conrelid
     JOIN pg_class pl ON pl.oid = f.confrelid
     JOIN pg_namespace n ON n.oid = pl.relnamespace
     JOIN unnest(f.conkey) AS k(colnum) ON true
     JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.colnum
     WHERE f.contype = 'f' AND pl.relname = 'projects' AND n.nspname = 'public'
       AND cl.relname <> 'projects' AND a.attname = $1
     ORDER BY 1`,
    [PROJECT_SCOPED_FK]
  );
  return res.rows.map((r) => r.child);
}

async function countProjectScoped(client, table, projectIds) {
  const res = await client.query(
    `SELECT count(*)::int AS n FROM "public".${quoteIdent(table)} WHERE ${quoteIdent(PROJECT_SCOPED_FK)} = ANY($1::uuid[])`,
    [projectIds]
  );
  return res.rows[0].n;
}

async function rowsProjectScoped(client, table, projectIds) {
  const res = await client.query(
    `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t WHERE ${quoteIdent(PROJECT_SCOPED_FK)} = ANY($1::uuid[])`,
    [projectIds]
  );
  return res.rows.map((r) => r.row);
}

/**
 * Hijos de `table` por una FK de UNA columna con `ON DELETE CASCADE`. Se piden
 * sólo esas: una FK compuesta no identifica la fila hija con una sola columna y
 * no se puede enumerar con seguridad (se queda en el gate de dependencias).
 */
async function cascadeChildFks(client, table) {
  const res = await client.query(
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

/** Filas de `child` con `col` apuntando a alguna de las filas candidatas. */
async function rowsByFk(client, child, col, parentIds) {
  const res = await client.query(
    `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(child)} t WHERE ${quoteIdent(col)}::text = ANY($1::text[])`,
    [parentIds]
  );
  return res.rows.map((r) => r.row);
}

// ── Descubrimiento de candidatos ────────────────────────────────────────
async function findCandidates(client) {
  const tablesRes = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const tables = tablesRes.rows
    .map((r) => r.tablename)
    .filter((t) => PURGE_TABLES.has(t))
    .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

  const outOfScope = onlyTables.filter(
    (t) =>
      !PURGE_TABLES.has(t) && !PROJECT_SCOPED_TABLES.has(t) && !PROJECT_SCOPED_CASCADE_TABLES.has(t)
  );
  const byTable = {};
  const truncated = [];
  let scanned = 0;

  // Añade una fila candidata sin duplicar: una misma fila puede llegar por
  // coincidir con un patrón Y por pertenecer a un proyecto demo.
  const add = (table, pk, row) => {
    const key = pk.map((c) => String(row[c])).join("|");
    byTable[table] ||= { pk, ids: [], rows: [], keys: new Set() };
    if (byTable[table].keys.has(key)) return false;
    byTable[table].keys.add(key);
    byTable[table].ids.push(pk.map((c) => row[c]));
    byTable[table].rows.push(row);
    return true;
  };

  // 1) Barrido por patrones (alcance: PURGE_TABLES).
  for (const table of tables) {
    const cols = await textColumns(client, table);
    const pk = await primaryKey(client, table);
    if (cols.length === 0 || pk.length === 0) continue; // sin PK no hay borrado seguro
    scanned++;
    const rows = await selectMatches(client, table, cols);
    if (rows.length >= ROWS_PER_TABLE) truncated.push(`${table} (${rows.length})`);
    const kept = [];
    for (const row of rows) {
      const blob = JSON.stringify(row).toLowerCase();
      if (KEEP_ROWS.some((k) => k.table === table && blob.includes(k.match.toLowerCase()))) {
        kept.push(row[pk[0]]);
        continue;
      }
      add(table, pk, row);
    }
    if (kept.length > 0) line(`   (KEEP) ${table}: ${kept.length} fila(s) excluidas por allowlist`);
  }

  const inScope = (t) => onlyTables.length === 0 || onlyTables.includes(t);

  // 2) Proyectos placeholder/fixture POR SÍ MISMOS. En Fase 1 estos proyectos
  //    coincidían además con un PATTERN de texto y el barrido ya los capturaba;
  //    los placeholder de P0.5 sólo se identifican por NOMBRE EXACTO
  //    (`PLACEHOLDER_PROJECT_NAMES`), así que sin esto se enumerarían sus hijos
  //    pero no el padre. Se cuentan como candidatos `projects` (ver el gate de
  //    recuento: `PURGE_EXPECTED.projects` incluye ambos orígenes).
  const projectPk = await primaryKey(client, "projects");
  const demoRowsByPattern = await selectMatches(
    client,
    "projects",
    await textColumns(client, "projects"),
    [{ id: "demo-project", kind: "DELETE", find: DEMO_PROJECT_PATTERNS }]
  );
  const demoRowsByName = (
    await client.query(
      `SELECT to_jsonb(t) AS row FROM "public"."projects" t WHERE lower(t.name) = ANY($1::text[])`,
      [PLACEHOLDER_PROJECT_NAMES.map((n) => n.toLowerCase())]
    )
  ).rows.map((r) => r.row);
  // `demoIds` se calcula SIEMPRE (no depende de `--tables`): es el origen de la
  // regla project-scoped. Las filas del proyecto sólo se añaden si están en alcance.
  const demoIds = [];
  for (const row of [...demoRowsByPattern, ...demoRowsByName]) {
    const blob = JSON.stringify(row).toLowerCase();
    if (KEEP_ROWS.some((k) => blob.includes(k.match.toLowerCase()))) continue;
    const id = String(row[projectPk[0]]);
    if (!demoIds.includes(id)) demoIds.push(id);
    if (inScope("projects")) add("projects", projectPk, row);
  }

  // 2b) Huérfanos INVERSOS: `public.users` sin identidad en `auth.users` (hoy el
  //     bypass de desarrollo `dev@localhost.dev`). Es integridad referencial, no
  //     un patrón de texto; se cuenta como candidato `users`.
  const userPk = await primaryKey(client, "users");
  if (userPk.length > 0 && inScope("users")) {
    const orphans = (
      await client.query(
        `SELECT to_jsonb(t) AS row FROM "public"."users" t
          WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.id)`
      )
    ).rows.map((r) => r.row);
    for (const row of orphans) {
      const blob = JSON.stringify(row).toLowerCase();
      if (KEEP_ROWS.some((k) => k.table === "users" && blob.includes(k.match.toLowerCase())))
        continue;
      add("users", userPk, row);
    }
  }

  // Los recuentos "por patrón" incluyen ya el barrido, los placeholder por
  // nombre y los huérfanos inversos — pero NO las filas project-scoped, que van
  // por su propio gate.
  const patternIds = {};
  for (const [t, c] of Object.entries(byTable)) patternIds[t] = c.ids.length;

  const discovered = await discoveredProjectScoped(client);
  const projectScoped = {};
  for (const table of discovered) {
    if (!PROJECT_SCOPED_TABLES.has(table)) continue;
    if (onlyTables.length > 0 && !onlyTables.includes(table)) continue;
    if (demoIds.length === 0) break;
    const pk = await primaryKey(client, table);
    if (pk.length === 0) {
      line(`   ⚠️  ${table}: sin PK, queda fuera de la regla project-scoped`);
      continue;
    }
    const n = await countProjectScoped(client, table, demoIds);
    if (n === 0) continue;
    for (const row of await rowsProjectScoped(client, table, demoIds)) {
      const blob = JSON.stringify(row).toLowerCase();
      if (KEEP_ROWS.some((k) => k.table === table && blob.includes(k.match.toLowerCase())))
        continue;
      add(table, pk, row);
    }
    projectScoped[table] = n;
  }

  // 3) Cierre project-scoped: filas que cuelgan de una fila candidata por una
  // FK ON DELETE CASCADE. La lista de padres se fija ANTES del bucle para que
  // el cierre sea de UN nivel: los hijos de un hijo no entran sin declararse, y
  // si aparecen el gate de dependencias los reporta (nada se amplía en
  // silencio).
  const cascadeScoped = {};
  const notDeclaredCascade = new Set();
  for (const parent of Object.keys(byTable)) {
    const parentIds = byTable[parent].ids.map((tuple) => String(tuple[0]));
    if (parentIds.length === 0) continue;
    for (const fk of await cascadeChildFks(client, parent)) {
      if (onlyTables.length > 0 && !onlyTables.includes(fk.child)) continue;
      const pk = await primaryKey(client, fk.child);
      if (pk.length === 0) {
        line(`   ⚠️  ${fk.child}: sin PK, queda fuera del cierre project-scoped`);
        continue;
      }
      let added = 0;
      for (const row of await rowsByFk(client, fk.child, fk.col, parentIds)) {
        const blob = JSON.stringify(row).toLowerCase();
        if (KEEP_ROWS.some((k) => k.table === fk.child && blob.includes(k.match.toLowerCase())))
          continue;
        if (add(fk.child, pk, row)) added++;
      }
      if (added === 0) continue;
      cascadeScoped[fk.child] = (cascadeScoped[fk.child] ?? 0) + added;
      if (!PROJECT_SCOPED_TABLES.has(fk.child) && !PROJECT_SCOPED_CASCADE_TABLES.has(fk.child)) {
        notDeclaredCascade.add(fk.child);
      }
    }
  }

  return {
    byTable,
    scanned,
    outOfScope,
    patternIds,
    projectScoped,
    cascadeScoped,
    demoIds,
    truncated,
    declaredDiff: {
      notDeclared: discovered.filter((t) => !PROJECT_SCOPED_TABLES.has(t)),
      notFound: [...PROJECT_SCOPED_TABLES].filter((t) => !discovered.includes(t)).sort(),
      notDeclaredCascade: [...notDeclaredCascade].sort(),
    },
  };
}

// ── Gate de recuento ────────────────────────────────────────────────────
function checkCounts(patternIds, projectScoped) {
  const rows = [];
  const devOf = (got, exp) => Math.abs(got - exp) / Math.max(exp, 1);
  const compare = (actual, expected, source) => {
    // Con `--tables` el alcance es parcial: comparar el esperado global daría
    // "desviación" en todas las tablas no incluidas (falso positivo).
    const scope =
      onlyTables.length > 0
        ? new Set([...onlyTables, ...Object.keys(actual)])
        : new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const t of scope) {
      const exp = expected[t] ?? 0;
      const got = actual[t] ?? 0;
      if (devOf(got, exp) > DRIFT_TOLERANCE) {
        rows.push({
          source,
          table: t,
          expected: exp,
          actual: got,
          deviation: Number(devOf(got, exp).toFixed(2)),
        });
      }
    }
  };
  compare(patternIds, PURGE_EXPECTED, "patrón");
  compare(projectScoped, PURGE_EXPECTED_PROJECT_SCOPED, "project-scoped");
  const patternTotal = Object.values(patternIds).reduce((a, b) => a + b, 0);
  const scopedTotal = Object.values(projectScoped).reduce((a, b) => a + b, 0);
  if (onlyTables.length === 0) {
    const scopedExpected = Object.values(PURGE_EXPECTED_PROJECT_SCOPED).reduce((a, b) => a + b, 0);
    if (devOf(patternTotal, PURGE_EXPECTED_TOTAL) > DRIFT_TOLERANCE) {
      rows.push({
        source: "patrón",
        table: "(TOTAL)",
        expected: PURGE_EXPECTED_TOTAL,
        actual: patternTotal,
        deviation: Number(devOf(patternTotal, PURGE_EXPECTED_TOTAL).toFixed(2)),
      });
    }
    if (devOf(scopedTotal, scopedExpected) > DRIFT_TOLERANCE) {
      rows.push({
        source: "project-scoped",
        table: "(TOTAL)",
        expected: scopedExpected,
        actual: scopedTotal,
        deviation: Number(devOf(scopedTotal, scopedExpected).toFixed(2)),
      });
    }
  }
  return { drift: rows, patternTotal, scopedTotal };
}

// ── Gate de dependencias (lo que un DELETE se llevaría por delante) ─────
async function analyzeDependencies(client, byTable) {
  const findings = [];
  for (const [table, cand] of Object.entries(byTable)) {
    const parentIds = cand.ids.map((tuple) => tuple.map(String));
    if (parentIds.length === 0) continue;
    const fks = await inboundFks(client, table);
    for (const fk of fks) {
      const childCand = byTable[fk.child]?.ids.map((tuple) => String(tuple[0])) ?? [];
      const childPk = byTable[fk.child]?.pk?.[0];
      // Se compara en texto a propósito: evita adivinar el tipo del array y no
      // necesita índices (son COUNT sobre conjuntos pequeños).
      const params = [parentIds.map((t) => t[0]), childCand];
      let notCandidate = null;
      let perRow = [];
      if (childPk) {
        notCandidate = (
          await client.query(
            `SELECT count(*)::int AS n FROM "public".${quoteIdent(fk.child)}
             WHERE ${quoteIdent(fk.col)}::text = ANY($1::text[])
               AND ${quoteIdent(childPk)}::text <> ALL($2::text[])`,
            params
          )
        ).rows[0].n;
        if (notCandidate > 0) {
          perRow = (
            await client.query(
              `SELECT ${quoteIdent(fk.col)}::text AS parent, count(*)::int AS n
               FROM "public".${quoteIdent(fk.child)}
               WHERE ${quoteIdent(fk.col)}::text = ANY($1::text[])
                 AND ${quoteIdent(childPk)}::text <> ALL($2::text[])
               GROUP BY 1 ORDER BY 2 DESC, 1`,
              params
            )
          ).rows;
        }
      } else {
        notCandidate = (
          await client.query(
            `SELECT count(*)::int AS n FROM "public".${quoteIdent(fk.child)}
             WHERE ${quoteIdent(fk.col)}::text = ANY($1::text[])`,
            [params[0]]
          )
        ).rows[0].n;
      }
      if (notCandidate === 0) continue;
      findings.push({
        parent: table,
        child: fk.child,
        column: fk.col,
        rule: RULE[fk.rule] ?? fk.rule,
        notCandidate,
        perRow: perRow.map((r) => ({ pk: r.parent, rows: r.n })),
      });
    }
  }
  // CASCADE pierde datos, RESTRICT/NO ACTION hace fallar el DELETE, SET NULL
  // muta filas que no son candidatas. Se separan las tres clases porque exigen
  // respuestas distintas (ver la cabecera del script).
  const hardBlockers = findings.filter(
    (f) => f.rule === "NO ACTION" || f.rule === "RESTRICT" || f.rule === "SET DEFAULT"
  );
  // Las cascadas declaradas en CASCADE_ACCEPTED son pertenencias de la fila
  // candidata (claves, logs, notificaciones): borrarlas con ella es correcto y
  // se registran; el resto bloquea porque amplía el alcance sin declararlo.
  const isAccepted = (f) =>
    CASCADE_ACCEPTED.some((a) => a.parent === f.parent && a.child === f.child);
  const accepted = findings.filter((f) => f.rule === "CASCADE" && isAccepted(f));
  const cascades = findings.filter((f) => f.rule === "CASCADE" && !isAccepted(f));
  const warnings = findings.filter((f) => f.rule === "SET NULL");
  return { findings, hardBlockers, cascades, accepted, warnings };
}

/** Identidades de `auth.users` que comparten id o email con los candidatos. */
async function reportAuthIdentities(client, byTable) {
  const users = byTable.users;
  if (!users || users.ids.length === 0) return { count: 0, rows: [] };
  const ids = users.ids.map((t) => String(t[0]));
  const res = await client.query(
    `SELECT a.id, a.email, (a.id::text = ANY($1::text[])) AS por_id
     FROM auth.users a
     WHERE a.id::text = ANY($1::text[])
        OR a.email IN (SELECT email FROM public.users WHERE id::text = ANY($1::text[]))`,
    [ids]
  );
  return { count: res.rowCount, rows: res.rows };
}

// ── Orden FK-seguro entre las tablas candidatas ─────────────────────────
async function deletionOrder(client, byTable) {
  const targets = Object.keys(byTable);
  const order = [];
  const visiting = new Set(); // guarda contra ciclos de FK (A→B→A)
  const visit = async (table) => {
    if (visiting.has(table) || order.includes(table)) return;
    visiting.add(table);
    const fks = await inboundFks(client, table);
    for (const fk of fks) {
      if (!byTable[fk.child]) continue;
      await visit(fk.child); // hijos primero (sin CASCADE, no habría forma de borrar el padre)
    }
    visiting.delete(table);
    if (!order.includes(table)) order.push(table);
  };
  for (const t of targets) await visit(t);
  return order;
}

/**
 * `DELETE FROM T WHERE (pk) IN (...)` parametrizado. Nunca se interpola un
 * valor de fila en el SQL.
 */
function deleteSql(table, pk, ids) {
  const cols = pk.map(quoteIdent).join(", ");
  let n = 0;
  const tuples = ids.map((tuple) => `(${tuple.map(() => `$${++n}`).join(", ")})`).join(", ");
  const sql = `DELETE FROM "public".${quoteIdent(table)} WHERE (${cols}) IN (${tuples})`;
  if (!sql.startsWith("DELETE FROM")) throw new Error("la purga sólo emite DELETE");
  return { sql, values: ids.flat() };
}

// ── main ────────────────────────────────────────────────────────────────
async function main() {
  try {
    assertPolicyCoherent();
  } catch (err) {
    console.error(`ERROR: política de datos falsos incoherente — ${err.message}`);
    process.exit(2);
  }
  if (apply && confirm !== today()) {
    console.error(`ERROR: --apply exige --confirm ${today()} (recibido: ${confirm ?? "nada"}).`);
    process.exit(2);
  }
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL/DIRECT_URL no encontrada en .env.local");
    process.exit(2);
  }

  // Un Client único, no un Pool: el flujo es secuencial y `pool.end()` se
  // queda esperando a que se libere un cliente si el error ocurre con uno
  // prestado (el dry-run se colgaba en vez de reportar el error).
  const client = new pg.Client(connectionFor(url));
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    progress("escaneando candidatos por patrón…");
    const {
      byTable,
      scanned,
      outOfScope,
      patternIds,
      projectScoped,
      cascadeScoped,
      demoIds,
      truncated,
      declaredDiff,
    } = await findCandidates(client);
    // La regla project-scoped es la SUMA de las dos vías (FK directa a la fila
    // del proyecto + cierre por CASCADE de una fila candidata): el recuento
    // declarado es uno solo, así que el gate compara el total.
    const mergedScoped = { ...projectScoped };
    for (const [t, n] of Object.entries(cascadeScoped))
      mergedScoped[t] = (mergedScoped[t] ?? 0) + n;
    const { drift, patternTotal, scopedTotal } = checkCounts(patternIds, mergedScoped);
    const { findings, hardBlockers, cascades, accepted, warnings } = await analyzeDependencies(
      client,
      byTable
    );
    const auth = await reportAuthIdentities(client, byTable);
    await client.query("COMMIT");
    const cascadeRows = cascades.reduce((a, c) => a + c.notCandidate, 0);
    // El borrado va por PK y las dos fuentes pueden solaparse, así que el total
    // real a borrar es la UNIÓN (se cuenta ya deduplicada en `byTable`).
    const unionRows = Object.values(byTable).reduce((a, c) => a + c.ids.length, 0);
    const declaredMismatch =
      declaredDiff.notDeclared.length > 0 ||
      declaredDiff.notFound.length > 0 ||
      declaredDiff.notDeclaredCascade.length > 0;
    const blocking =
      drift.length > 0 ||
      hardBlockers.length > 0 ||
      (cascades.length > 0 && !acceptCascade) ||
      declaredMismatch;
    progress(
      `patrón=${patternTotal} · project-scoped=${scopedTotal} · unión=${unionRows} · drift=${drift.length} · ` +
        `dependencias=${findings.length} (bloqueo=${hardBlockers.length} cascada=${cascadeRows} aceptada=${accepted.length})`
    );

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? "APPLY" : "DRY-RUN",
      url: projectLabel(url),
      tablesScanned: scanned,
      demoProjects: demoIds.length,
      candidates: {
        total: unionRows,
        byPattern: { total: patternTotal, byTable: patternIds },
        projectScoped: {
          total: scopedTotal,
          byTable: mergedScoped,
          direct: projectScoped,
          cascade: cascadeScoped,
        },
      },
      expected: {
        byPattern: { total: PURGE_EXPECTED_TOTAL, byTable: PURGE_EXPECTED },
        projectScoped: {
          total: Object.values(PURGE_EXPECTED_PROJECT_SCOPED).reduce((a, b) => a + b, 0),
          byTable: PURGE_EXPECTED_PROJECT_SCOPED,
        },
      },
      declaredProjectScoped: {
        notDeclared: declaredDiff.notDeclared,
        notFound: declaredDiff.notFound,
        notDeclaredCascade: declaredDiff.notDeclaredCascade,
      },
      truncatedTables: truncated,
      countDrift: drift,
      dependencies: findings,
      hardBlockers: hardBlockers.length,
      cascades: {
        accepted: acceptCascade,
        relations: cascades.length,
        rowsDestroyed: cascadeRows,
        declaredAccepted: accepted.map((a) => `${a.parent}<-${a.child}`),
      },
      warnings: warnings.length,
      authIdentities: {
        notTouched: auth.count,
        rows: auth.rows.map((r) => ({ email: r.email, porId: r.por_id })),
      },
      outOfScopeTables: outOfScope,
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      line(`Purga de datos falsos — modo ${report.mode} — ${report.generatedAt}`);
      line(
        `BD: ${report.url} · tablas por patrón escaneadas: ${scanned} · proyectos demo/fixture: ${demoIds.length}`
      );
      line("");
      line("── Candidatos por PATRÓN vs esperado ──");
      // Con `--tables` sólo se comparan las tablas del alcance: listar el
      // esperado global marcaría como desviación todo lo que no se ha mirado.
      const pkeys =
        onlyTables.length > 0
          ? [...new Set([...onlyTables, ...Object.keys(patternIds)])]
          : [...new Set([...Object.keys(PURGE_EXPECTED), ...Object.keys(patternIds)])];
      for (const t of pkeys.sort()) {
        const exp = PURGE_EXPECTED[t] ?? 0;
        const got = patternIds[t] ?? 0;
        if (got > 0 || exp > 0)
          line(
            `   ${String(t).padEnd(30)} esperado=${String(exp).padStart(4)}  real=${String(got).padStart(4)}${exp !== got ? "  ⚠️" : ""}`
          );
      }
      if (onlyTables.length === 0) {
        line(
          `   ${"TOTAL".padEnd(30)} esperado=${String(PURGE_EXPECTED_TOTAL).padStart(4)}  real=${String(patternTotal).padStart(4)}`
        );
      } else {
        line(`   (alcance parcial: ${onlyTables.join(", ")} — el TOTAL global no aplica)`);
      }
      line("");
      line(
        `── Filas PROJECT-SCOPED (de los ${demoIds.length} proyectos demo/fixture: FK directa + cierre por CASCADE) ──`
      );
      const scopedKeys = Object.keys(mergedScoped).sort();
      const scopedExpectedTotal = Object.values(PURGE_EXPECTED_PROJECT_SCOPED).reduce(
        (a, b) => a + b,
        0
      );
      if (scopedKeys.length === 0) line("   (ninguna)");
      for (const t of scopedKeys) {
        const exp = PURGE_EXPECTED_PROJECT_SCOPED[t] ?? 0;
        const got = mergedScoped[t] ?? 0;
        line(
          `   ${String(t).padEnd(30)} esperado=${String(exp).padStart(5)}  real=${String(got).padStart(5)}${exp !== got ? "  ⚠️" : ""}`
        );
      }
      if (onlyTables.length === 0 && scopedKeys.length > 0) {
        line(
          `   ${"TOTAL".padEnd(30)} esperado=${String(scopedExpectedTotal).padStart(5)}  real=${String(scopedTotal).padStart(5)}`
        );
      }
      const cascadeEntries = Object.entries(cascadeScoped).sort();
      const cascadeTotalRows = cascadeEntries.reduce((a, [, n]) => a + n, 0);
      line(
        `   · de ellas por cierre CASCADE: ${cascadeTotalRows} fila(s) en ${cascadeEntries.length} tabla(s)` +
          (cascadeEntries.length
            ? ` — ${cascadeEntries.map(([t, n]) => `${t}(${n})`).join(", ")}`
            : "")
      );
      line(`   UNIÓN real a borrar (patrón ∪ project-scoped, deduplicada): ${unionRows} fila(s)`);
      if (
        declaredDiff.notDeclared.length ||
        declaredDiff.notFound.length ||
        declaredDiff.notDeclaredCascade.length
      ) {
        line("");
        line("   ❌ EL CONJUNTO DECLARADO NO COINCIDE CON LA BD (project-scoped):");
        if (declaredDiff.notDeclared.length)
          line(`      en BD y NO declaradas: ${declaredDiff.notDeclared.join(", ")}`);
        if (declaredDiff.notFound.length)
          line(`      declaradas y NO en BD: ${declaredDiff.notFound.join(", ")}`);
        if (declaredDiff.notDeclaredCascade.length)
          line(`      por CASCADE y NO declaradas: ${declaredDiff.notDeclaredCascade.join(", ")}`);
      }
      if (truncated.length) {
        line("");
        line(
          `   ⚠️  TABLAS AL TOPE DE ${ROWS_PER_TABLE} FILAS POR PATRÓN (puede faltar basura): ${truncated.join(", ")}`
        );
      }
      if (drift.length) {
        line("");
        line("   ❌ DESVIACIÓN DE RECUENTO (>5%):");
        for (const d of drift)
          line(
            `      [${d.source}] ${d.table}: esperado ${d.expected}, real ${d.actual} (${Math.round(d.deviation * 100)}%)`
          );
      }
      if (findings.length) {
        line("");
        line("── Dependencias: lo que este DELETE se llevaría por delante ──");
        for (const f of findings) {
          const icon =
            f.rule === "SET NULL" ? "⚠️ " : f.rule === "CASCADE" && acceptCascade ? "🔻" : "🛑";
          const note =
            f.rule === "CASCADE"
              ? ` se BORRARÍAN por cascada${acceptCascade ? " (--accept-cascade)" : ""}`
              : " que NO son candidatas";
          line(
            `   ${icon} ${f.parent} ← ${f.child}.${f.column} [${f.rule}]: ${f.notCandidate} fila(s)${note}`
          );
          for (const r of f.perRow) line(`        ${r.pk} → ${r.rows} fila(s)`);
        }
        if (cascades.length > 0) {
          line("");
          line(
            `   Total en cascada: ${cascadeRows} fila(s) en ${cascades.length} relación(es) no apuntadas por los patrones.`
          );
        }
      }
      if (auth.count > 0) {
        line("");
        line(
          `── Identidades de auth.users ──  (este script NO las toca: es una operación de cuenta)`
        );
        line(
          `   ${auth.count} candidato(s) coinciden con una identidad de login; retíralas a mano si procede.`
        );
      }
      if (outOfScope.length) {
        line("");
        line(
          `   ⚠️  tablas solicitadas fuera de PURGE_TABLES (NO se tocan): ${outOfScope.join(", ")}`
        );
      }
      line("");
      line("Sólo DELETE con WHERE sobre PKs, en las tablas del allowlist, en una transacción.");
    }

    const bloqued = blocking;
    if (!apply) {
      if (!asJson) {
        line("");
        if (bloqued) {
          line("DRY-RUN: HAY BLOQUEOS — no se ha escrito nada y el --apply sería RECHAZADO.");
          if (drift.length) line(`  · recuento desviado: ${drift.map((d) => d.table).join(", ")}`);
          if (hardBlockers.length)
            line(
              `  · FK que harían fallar el DELETE: ${hardBlockers.map((b) => `${b.parent}←${b.child}(${b.rule})`).join(", ")}`
            );
          if (cascades.length && !acceptCascade)
            line(
              `  · cascada no aceptada (${cascadeRows} filas): repite con --accept-cascade si es intencionado`
            );
        } else {
          line("DRY-RUN: limpio — no se ha escrito nada. Para aplicar:");
          line(
            `  node scripts/db/fake-data-purge.mjs --apply${cascades.length ? " --accept-cascade" : ""} --confirm ${today()}`
          );
        }
      }
      await client.end().catch(() => {});
      process.exit(bloqued ? 1 : 0);
    }

    if (bloqued) {
      console.error(
        "ERROR: --apply RECHAZADO — resuelve los bloqueos del dry-run antes de borrar."
      );
      if (drift.length)
        console.error(`  recuento desviado: ${drift.map((d) => d.table).join(", ")}`);
      if (hardBlockers.length) {
        console.error(
          `  FK que harían fallar el DELETE (no aceptables por diseño): ${hardBlockers
            .map((b) => `${b.parent}←${b.child}(${b.rule}, ${b.notCandidate} filas)`)
            .join(", ")}`
        );
      }
      if (cascades.length && !acceptCascade) {
        console.error(
          `  cascada no aceptada: ${cascades.length} relación(es), ${cascadeRows} filas. Revisa el dry-run y repite con --accept-cascade si procede.`
        );
      }
      await client.end().catch(() => {});
      process.exit(2);
    }

    // 1) Snapshot ANTES de tocar nada (restauración manual).
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(ROOT, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const snapshot = path.join(dir, `fake-data-purge-${ts}.json`);
    fs.writeFileSync(
      snapshot,
      JSON.stringify({ generatedAt: report.generatedAt, candidates: byTable }, null, 2)
    );

    // 2) Una sola transacción; cualquier error ⇒ ROLLBACK total.
    const order = await deletionOrder(client, byTable);
    let deleted = 0;
    try {
      await client.query("BEGIN");
      for (const table of order) {
        const cand = byTable[table];
        if (!cand) continue;
        const { sql, values } = deleteSql(table, cand.pk, cand.ids);
        const res = await client.query(sql, values);
        deleted += res.rowCount;
        line(`   DELETE ${table}: ${res.rowCount} fila(s)`);
      }
      await client.query("COMMIT");
      line("");
      line(`COMMIT OK — ${deleted} fila(s) borradas. Snapshot: backups/${path.basename(snapshot)}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("ROLLBACK por error:", err.message);
      await client.end().catch(() => {});
      process.exit(2);
    }

    await client.end().catch(() => {});
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err.message);
    await client.end().catch(() => {});
    process.exit(2);
  }
}

main();
