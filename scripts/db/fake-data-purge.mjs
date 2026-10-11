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
        y sólo en tablas de `PURGE_TABLES`. Nunca `TRUNCATE`, nunca `DROP`,
        nunca `UPDATE`. Lo que no está en el allowlist se informa, no se toca.
     3. RECUENTO: los candidatos se comparan con `PURGE_EXPECTED` (versionado).
        Desviación >5% en una tabla o en el total ⇒ el `--apply` se ABORTA (el
        dry-run sale con exit 1). Un recuento que no cuadra es un hecho nuevo,
        no ruido: se investiga y se actualiza el esperado, no se ignora.
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
     7. `public.users` y `auth.users` son tablas DISTINTAS (aquí sólo 6 de 21
        filas coinciden): este script NO borra identidades de `auth.users` —
        eso es una operación de cuenta, no una limpieza de datos. Las identidades
        que sí existen se INFORMAN para que se retiren a mano si procede.

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
  KEEP,
  PURGE_TABLES,
  PURGE_EXPECTED,
  PURGE_EXPECTED_TOTAL,
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
const today = () => new Date().toISOString().slice(0, 10);
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
    [table],
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
    [table],
  );
  return res.rows.map((r) => r.column_name);
}

/** Filas de `table` con algún fragmento de PATTERNS en alguna columna de texto. */
async function selectMatches(client, table, cols) {
  const params = [];
  const ors = [];
  for (const p of PATTERNS) {
    for (const f of p.find) {
      params.push(f.toLowerCase());
      const ph = `$${params.length}`;
      ors.push(cols.map((c) => `strpos(lower(${quoteIdent(c)}::text), ${ph}) > 0`).join(" OR "));
    }
  }
  const res = await client.query(
    `SELECT to_jsonb(t) AS row FROM "public".${quoteIdent(table)} t
     WHERE (${ors.join(" OR ")}) LIMIT ${ROWS_PER_TABLE}`,
    params,
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
    [table],
  );
  return res.rows;
}

const RULE = { c: "CASCADE", n: "NO ACTION", r: "RESTRICT", d: "SET NULL", a: "SET DEFAULT" };

// ── Descubrimiento de candidatos ────────────────────────────────────────
async function findCandidates(client) {
  const tablesRes = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tables = tablesRes.rows
    .map((r) => r.tablename)
    .filter((t) => PURGE_TABLES.has(t))
    .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

  const outOfScope = onlyTables.filter((t) => !PURGE_TABLES.has(t));
  const byTable = {};
  let scanned = 0;

  for (const table of tables) {
    const cols = await textColumns(client, table);
    const pk = await primaryKey(client, table);
    if (cols.length === 0 || pk.length === 0) continue; // sin PK no hay borrado seguro
    scanned++;
    const rows = await selectMatches(client, table, cols);
    const kept = [];
    for (const row of rows) {
      const blob = JSON.stringify(row).toLowerCase();
      const isKept = KEEP_ROWS.some((k) => k.table === table && blob.includes(k.match.toLowerCase()));
      if (isKept) {
        kept.push(row[pk[0]]);
        continue;
      }
      (byTable[table] ||= { pk, ids: [], rows: [] });
      byTable[table].ids.push(pk.map((c) => row[c]));
      byTable[table].rows.push(row);
    }
    if (kept.length > 0) line(`   (KEEP) ${table}: ${kept.length} fila(s) excluidas por allowlist`);
  }
  return { byTable, scanned, outOfScope };
}

// ── Gate de recuento ────────────────────────────────────────────────────
function checkCounts(byTable) {
  const actual = {};
  for (const [t, c] of Object.entries(byTable)) actual[t] = c.ids.length;
  const rows = [];
  // Con `--tables` el alcance es parcial: comparar el esperado global daría
  // "desviación" en todas las tablas no incluidas (falso positivo).
  const scope =
    onlyTables.length > 0
      ? new Set([...onlyTables, ...Object.keys(actual)])
      : new Set([...Object.keys(PURGE_EXPECTED), ...Object.keys(actual)]);
  for (const t of scope) {
    const exp = PURGE_EXPECTED[t] ?? 0;
    const got = actual[t] ?? 0;
    const dev = Math.abs(got - exp) / Math.max(exp, 1);
    if (dev > DRIFT_TOLERANCE) rows.push({ table: t, expected: exp, actual: got, deviation: Number(dev.toFixed(2)) });
  }
  const totalActual = Object.values(actual).reduce((a, b) => a + b, 0);
  if (onlyTables.length === 0) {
    const totalDev = Math.abs(totalActual - PURGE_EXPECTED_TOTAL) / Math.max(PURGE_EXPECTED_TOTAL, 1);
    if (totalDev > DRIFT_TOLERANCE) {
      rows.push({ table: "(TOTAL)", expected: PURGE_EXPECTED_TOTAL, actual: totalActual, deviation: Number(totalDev.toFixed(2)) });
    }
  }
  return { drift: rows, actual, totalActual };
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
            params,
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
              params,
            )
          ).rows;
        }
      } else {
        notCandidate = (
          await client.query(
            `SELECT count(*)::int AS n FROM "public".${quoteIdent(fk.child)}
             WHERE ${quoteIdent(fk.col)}::text = ANY($1::text[])`,
            [params[0]],
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
  const hardBlockers = findings.filter((f) => f.rule === "NO ACTION" || f.rule === "RESTRICT" || f.rule === "SET DEFAULT");
  const cascades = findings.filter((f) => f.rule === "CASCADE");
  const warnings = findings.filter((f) => f.rule === "SET NULL");
  return { findings, hardBlockers, cascades, warnings };
}

/** Identidades de `auth.users` que comparten id o email con los candidatos. */
async function reportAuthIdentities(client, byTable) {
  const users = byTable.users;
  if (!users || users.length === 0) return { count: 0, rows: [] };
  const ids = users.ids.map((t) => String(t[0]));
  const res = await client.query(
    `SELECT a.id, a.email, (a.id::text = ANY($1::text[])) AS por_id
     FROM auth.users a
     WHERE a.id::text = ANY($1::text[])
        OR a.email IN (SELECT email FROM public.users WHERE id::text = ANY($1::text[]))`,
    [ids],
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
    const { byTable, scanned, outOfScope } = await findCandidates(client);
    const { drift, actual, totalActual } = checkCounts(byTable);
    const { findings, hardBlockers, cascades, warnings } = await analyzeDependencies(client, byTable);
    const auth = await reportAuthIdentities(client, byTable);
    await client.query("COMMIT");
    const cascadeRows = cascades.reduce((a, c) => a + c.notCandidate, 0);
    const blocking = drift.length > 0 || hardBlockers.length > 0 || (cascades.length > 0 && !acceptCascade);
    progress(`candidatos=${totalActual} · drift=${drift.length} · dependencias=${findings.length} (bloqueo=${hardBlockers.length} cascada=${cascadeRows})`);

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? "APPLY" : "DRY-RUN",
      url: projectLabel(url),
      tablesScanned: scanned,
      candidates: { total: totalActual, byTable: actual },
      expected: { total: PURGE_EXPECTED_TOTAL, byTable: PURGE_EXPECTED },
      countDrift: drift,
      dependencies: findings,
      hardBlockers: hardBlockers.length,
      cascades: { accepted: acceptCascade, relations: cascades.length, rowsDestroyed: cascadeRows },
      warnings: warnings.length,
      authIdentities: { notTouched: auth.count, rows: auth.rows.map((r) => ({ email: r.email, porId: r.por_id })) },
      outOfScopeTables: outOfScope,
    };

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      line(`Purga de datos falsos — modo ${report.mode} — ${report.generatedAt}`);
      line(`BD: ${report.url} · tablas del allowlist escaneadas: ${scanned}`);
      line("");
      line("── Candidatos vs recuento esperado ──");
      // Con `--tables` sólo se comparan las tablas del alcance: listar el
      // esperado global marcaría como desviación todo lo que no se ha mirado.
      const keys =
        onlyTables.length > 0
          ? [...new Set([...onlyTables, ...Object.keys(actual)])]
          : [...new Set([...Object.keys(PURGE_EXPECTED), ...Object.keys(actual)])];
      for (const t of keys.sort()) {
        const exp = PURGE_EXPECTED[t] ?? 0;
        const got = actual[t] ?? 0;
        const flag = exp !== got ? "  ⚠️" : "";
        if (got > 0 || exp > 0) line(`   ${String(t).padEnd(30)} esperado=${String(exp).padStart(3)}  real=${String(got).padStart(3)}${flag}`);
      }
      if (onlyTables.length === 0) {
        line(`   ${"TOTAL".padEnd(30)} esperado=${String(PURGE_EXPECTED_TOTAL).padStart(3)}  real=${String(totalActual).padStart(3)}`);
      } else {
        line(`   (alcance parcial: ${onlyTables.join(", ")} — el TOTAL global no aplica)`);
      }
      if (drift.length) {
        line("");
        line("   ❌ DESVIACIÓN DE RECUENTO (>5%):");
        for (const d of drift) line(`      ${d.table}: esperado ${d.expected}, real ${d.actual} (${Math.round(d.deviation * 100)}%)`);
      }
      if (findings.length) {
        line("");
        line("── Dependencias: lo que este DELETE se llevaría por delante ──");
        for (const f of findings) {
          const icon =
            f.rule === "SET NULL" ? "⚠️ " : f.rule === "CASCADE" && acceptCascade ? "🔻" : "🛑";
          const note = f.rule === "CASCADE" ? ` se BORRARÍAN por cascada${acceptCascade ? " (--accept-cascade)" : ""}` : " que NO son candidatas";
          line(`   ${icon} ${f.parent} ← ${f.child}.${f.column} [${f.rule}]: ${f.notCandidate} fila(s)${note}`);
          for (const r of f.perRow) line(`        ${r.pk} → ${r.rows} fila(s)`);
        }
        if (cascades.length > 0) {
          line("");
          line(`   Total en cascada: ${cascadeRows} fila(s) en ${cascades.length} relación(es) no apuntadas por los patrones.`);
        }
      }
      if (auth.count > 0) {
        line("");
        line(`── Identidades de auth.users ──  (este script NO las toca: es una operación de cuenta)`);
        line(`   ${auth.count} candidato(s) coinciden con una identidad de login; retíralas a mano si procede.`);
      }
      if (outOfScope.length) {
        line("");
        line(`   ⚠️  tablas solicitadas fuera de PURGE_TABLES (NO se tocan): ${outOfScope.join(", ")}`);
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
            line(`  · FK que harían fallar el DELETE: ${hardBlockers.map((b) => `${b.parent}←${b.child}(${b.rule})`).join(", ")}`);
          if (cascades.length && !acceptCascade)
            line(`  · cascada no aceptada (${cascadeRows} filas): repite con --accept-cascade si es intencionado`);
        } else {
          line("DRY-RUN: limpio — no se ha escrito nada. Para aplicar:");
          line(`  node scripts/db/fake-data-purge.mjs --apply${cascades.length ? " --accept-cascade" : ""} --confirm ${today()}`);
        }
      }
      await client.end().catch(() => {});
      process.exit(bloqued ? 1 : 0);
    }

    if (bloqued) {
      console.error("ERROR: --apply RECHAZADO — resuelve los bloqueos del dry-run antes de borrar.");
      if (drift.length) console.error(`  recuento desviado: ${drift.map((d) => d.table).join(", ")}`);
      if (hardBlockers.length) {
        console.error(
          `  FK que harían fallar el DELETE (no aceptables por diseño): ${hardBlockers
            .map((b) => `${b.parent}←${b.child}(${b.rule}, ${b.notCandidate} filas)`)
            .join(", ")}`,
        );
      }
      if (cascades.length && !acceptCascade) {
        console.error(
          `  cascada no aceptada: ${cascades.length} relación(es), ${cascadeRows} filas. Revisa el dry-run y repite con --accept-cascade si procede.`,
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
      JSON.stringify({ generatedAt: report.generatedAt, candidates: byTable }, null, 2),
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
