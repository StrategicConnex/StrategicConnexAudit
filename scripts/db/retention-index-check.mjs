#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Verificación de índices de retención (P2-14).

   CIERRA LA DUDA DE P2-14: la migración 0051 declara 4 índices btree sobre
   `created_at` para que el DELETE de retención de `cleanup.trigger.ts`
   (`WHERE created_at < now() - interval '30 days'`) deje de ser un seq scan
   sobre tablas sin cota de crecimiento. Saber que el `CREATE INDEX` está en
   la migración NO prueba que el planificador lo use: el plan depende de las
   estadísticas de la tabla.

   QUÉ HACE, EN ORDEN:
     1. existencias  → pg_indexes: los 4 índices, con su definición y columna.
     2. ANALYZE      → refresca estadísticas de las 4 tablas (no destructivo).
     3. plan real    → `EXPLAIN (ANALYZE, BUFFERS)` del DELETE de retención
                       DENTRO de una transacción que SIEMPRE hace ROLLBACK.
     4. usabilidad   → si el planificador eligió seq scan, repite el mismo
                       DELETE con `enable_seqscan = off` para distinguir dos
                       causas muy distintas: «tabla demasiado pequeña para
                       que el índice compense» (no es regresión) frente a
                       «el índice no cubre el predicado» (sí lo es).
     5. idx_scan     → contador de uso del índice en pg_stat_user_indexes.

   NO BORRA NADA. `EXPLAIN ANALYZE` sobre un DELETE *ejecuta* la sentencia: por
   eso el paso 3 va en BEGIN/ROLLBACK con un `pg.Client` único (con un `Pool`
   los statements podrían caer en conexiones distintas y la transacción no
   envolvería el DELETE). El plan, los buffers y el tiempo medidos son
   idénticos a los de la ejecución real.

   Uso:
     node scripts/db/retention-index-check.mjs              # verificación completa
     node scripts/db/retention-index-check.mjs --benchmark  # + medición con/sin índice
     node scripts/db/retention-index-check.mjs --json       # salida para CI
     node scripts/db/retention-index-check.mjs --sql        # sólo imprime el SQL

   `--benchmark` mide el efecto del btree sobre volumen representativo, porque
   las 3 tablas de inteligencia están VACÍAS en la BD actual: con 0 filas el
   planificador elige seq scan por coste, y eso no mide nada. La medición usa
   DOS tablas temporales con la misma forma (rasgos de `app_logs`), una con
   índice y otra sin él, dentro de una única transacción con ROLLBACK: no toca
   ninguna tabla real ni toma locks sobre ella. Volumen por defecto 200.000
   filas sobre 31 días (tasa de expirados ≈ 1/31, que es el estado estable de
   una retención que ya corre a diario). Configurable con `--bench-rows N` y
   `--bench-trials N`; se reporta la MEDIANA de las pasadas, no una sola
   medición, y el orden de medición alterna para que el sesgo de caché no
   favorezca siempre al mismo plan.

   Variables: DIRECT_URL (o DATABASE_URL) en .env.local o entorno.

   Exit codes: 0 índice presente y usable en el predicado de retención ·
               1 índice ausente o no usable (regresión de P2-14) ·
               2 no se pudo verificar (sin credenciales o sin conexión).
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";
import {
  RETENTION_TARGETS,
  RETENTION_DAYS,
  predicateFor,
  buildAnalyzeSql,
  buildExplainSql,
  classifyPlan,
  verdictFor,
  median,
} from "../lib/retention-plans.mjs";

const PREDICATE = predicateFor;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const AS_JSON = process.argv.includes("--json");
const SQL_ONLY = process.argv.includes("--sql");
const BENCHMARK = process.argv.includes("--benchmark");
const benchRowsIdx = process.argv.indexOf("--bench-rows");
const BENCH_ROWS = benchRowsIdx !== -1 ? Number(process.argv[benchRowsIdx + 1]) : 200_000;
const benchTrialsIdx = process.argv.indexOf("--bench-trials");
const BENCH_TRIALS = benchTrialsIdx !== -1 ? Number(process.argv[benchTrialsIdx + 1]) : 3;
if (BENCHMARK && (!Number.isInteger(BENCH_ROWS) || BENCH_ROWS < 1000)) {
  console.error("❌ --bench-rows debe ser un entero >= 1000");
  process.exit(2);
}
if (BENCHMARK && (!Number.isInteger(BENCH_TRIALS) || BENCH_TRIALS < 1)) {
  console.error("❌ --bench-trials debe ser un entero >= 1");
  process.exit(2);
}

if (SQL_ONLY) {
  console.log(buildAnalyzeSql());
  console.log("\n-- Envolver cada EXPLAIN en BEGIN/ROLLBACK para no borrar filas:\n");
  console.log(buildExplainSql());
  process.exit(0);
}

// ── .env.local sin dependencias (CI puede usar env del sistema) ──────────
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
  process.exit(2);
}

/**
 * Benchmark con/sin índice sobre tablas temporales, todo en una transacción
 * con ROLLBACK. Mide el DELETE de retención en volumen representativo usando
 * una forma de fila equivalente a `app_logs` y `--bench-days` de antigüedad.
 *
 * @param {pg.Client} client
 * @param {number} rows filas sintéticas por tabla (--bench-rows)
 * @param {number} days días de historia sintética (la ventana retenida es 30)
 * @param {number} trials pasadas medidas por configuración (--bench-trials)
 */
async function benchmark(client, rows, days, trials) {
  await client.query("begin");
  try {
    const shape = (name) => `create temp table ${name} (
      id uuid default gen_random_uuid() primary key,
      created_at timestamptz not null,
      level text not null default 'error',
      message text not null,
      source text not null
    ) on commit drop`;

    await client.query(shape("bench_no_index"));
    await client.query(shape("bench_with_index"));

    // Distribución CRONOLÓGICA (inserción append-only): `created_at` crece con
    // `g`, así que las filas expiradas son las más antiguas y quedan CONTIGUAS
    // al principio del heap, que es el estado real de una tabla alimentada por
    // `defaultNow()`. Una distribución intercalada (tipo `g % days`) repartiría
    // las filas expiradas por TODAS las páginas: ningún índice podría evitar
    // las lecturas de heap y la medición describiría un caso que no ocurre.
    const insertSql = (name) => `insert into ${name} (created_at, message, source)
      select now() - (($2 - g)::numeric / $2) * ($1 * interval '1 day'),
             'synthetic retention benchmark row ' || g,
             'benchmark'
        from generate_series($3::int, $4::int) as g`;

    for (const name of ["bench_no_index", "bench_with_index"]) {
      await client.query(insertSql(name), [days, rows, 1, rows]);
    }
    await client.query(
      "create index bench_with_index_created_at on bench_with_index using btree (created_at)"
    );
    await client.query("analyze bench_no_index");
    await client.query("analyze bench_with_index");

    const expired = await client.query(
      `select count(*)::bigint as n from bench_no_index where ${PREDICATE(RETENTION_DAYS)}`
    );
    const expiredRows = Number(expired.rows[0].n);

    const measure = async (table) => {
      const res = await client.query(
        `explain (analyze, buffers, format text) delete from ${table} where ${PREDICATE(RETENTION_DAYS)}`
      );
      return classifyPlan(res.rows.map((r) => r["QUERY PLAN"]).join("\n"));
    };

    // Recarga barata entre pasadas: sólo las filas que el DELETE acaba de
    // quitar (la fracción expirada), no la tabla completa.
    const restore = async () => {
      for (const name of ["bench_no_index", "bench_with_index"]) {
        await client.query(insertSql(name), [days, rows, 1, expiredRows]);
        await client.query(`analyze ${name}`);
      }
    };

    const passes = [];
    for (let i = 0; i < trials; i++) {
      // Orden alternado: el plan medido primero puede llevarse un sesgo de
      // caché/contensión, así que en pasadas impares se invierte el orden y
      // ninguna configuración mide siempre en la misma posición.
      const order = i % 2 === 0 ? ["with", "without"] : ["without", "with"];
      const pass = {};
      for (const which of order) {
        pass[which] =
          which === "with" ? await measure("bench_with_index") : await measure("bench_no_index");
      }
      passes.push(pass);
      if (i < trials - 1) await restore();
    }

    const ms = (key) => passes.map((p) => p[key].execTime);
    return {
      rows,
      days,
      trials,
      expiredRows,
      expiredPct: (expiredRows / rows) * 100,
      withIndex: passes[0].with,
      withoutIndex: passes[0].without,
      withIndexMs: ms("with"),
      withoutIndexMs: ms("without"),
      medianWithIndexMs: median(ms("with")),
      medianWithoutIndexMs: median(ms("without")),
    };
  } finally {
    await client.query("rollback");
  }
}

const client = new pg.Client(connectionFor(dbUrl));
const report = { targets: [], ok: false, verified: false, benchmark: null };

try {
  await client.connect();
  const who = await client.query(
    "select current_database() as db, current_user as usr, version() as v"
  );
  report.database = who.rows[0].db;
  report.user = who.rows[0].usr;
  report.server = String(who.rows[0].v).split(" ").slice(0, 2).join(" ");
  await client.query("set statement_timeout = '120s'");

  if (!AS_JSON) {
    console.log(`📊 BD=${report.database} · usuario=${report.user} · ${report.server}`);
    console.log(`   Predicado de retención: ${PREDICATE(RETENTION_DAYS)}\n`);
  }

  // ── 1. Existencias (sólo lectura) ──────────────────────────────────────
  const idx = await client.query(
    `select i.indexname, i.indexdef, i.tablename
       from pg_indexes i
      where i.schemaname = 'public' and i.indexname = any($1::text[])`,
    [RETENTION_TARGETS.map((t) => t.index)]
  );
  const indexByName = new Map(idx.rows.map((r) => [r.indexname, r]));

  const stats = await client.query(
    `select c.relname as table,
            coalesce(c.reltuples, 0)::bigint as est_rows,
            pg_total_relation_size(c.oid) as bytes
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [RETENTION_TARGETS.map((t) => t.table)]
  );
  const statByTable = new Map(stats.rows.map((r) => [r.table, r]));

  const scans = await client.query(
    `select indexrelname, idx_scan from pg_stat_user_indexes where indexrelname = any($1::text[])`,
    [RETENTION_TARGETS.map((t) => t.index)]
  );
  const scanByName = new Map(scans.rows.map((r) => [r.indexrelname, Number(r.idx_scan)]));

  // ── 2. ANALYZE (no destructivo) ────────────────────────────────────────
  const analyzeMs = {};
  for (const t of RETENTION_TARGETS) {
    const t0 = Date.now();
    try {
      await client.query(`analyze ${t.table}`);
      analyzeMs[t.table] = Date.now() - t0;
    } catch (error) {
      analyzeMs[t.table] = `failed: ${error.message}`;
    }
  }

  // ── 3/4. Plan real y plan forzado, ambos con ROLLBACK ──────────────────
  for (const target of RETENTION_TARGETS) {
    const entry = {
      ...target,
      indexExists: indexByName.has(target.index),
      indexDef: indexByName.get(target.index)?.indexdef ?? null,
      estimatedRows: Number(statByTable.get(target.table)?.est_rows ?? 0),
      sizeBytes: Number(statByTable.get(target.table)?.bytes ?? 0),
      idxScan: scanByName.get(target.index) ?? null,
      analyzeMs: analyzeMs[target.table],
      plan: null,
      forcedPlan: null,
    };

    if (entry.indexExists) {
      try {
        const total = await client.query(`select count(*)::bigint as n from ${target.table}`);
        entry.totalRows = Number(total.rows[0].n);
        const old = await client.query(
          `select count(*)::bigint as n from ${target.table} where ${PREDICATE(target.retentionDays)}`
        );
        entry.expiredRows = Number(old.rows[0].n);
        entry.expiredPct = entry.totalRows > 0 ? (entry.expiredRows / entry.totalRows) * 100 : 0;
      } catch (error) {
        entry.countError = error.message;
      }
    }

    if (entry.indexExists) {
      // EXPLAIN ANALYZE DELETE ejecuta el DELETE: BEGIN/ROLLBACK lo deshace.
      for (const [key, prelude] of [
        ["plan", null],
        ["forcedPlan", "set local enable_seqscan = off"],
      ]) {
        if (key === "forcedPlan" && entry.plan?.indexNames.length > 0) continue; // ya usa el índice
        await client.query("begin");
        try {
          if (prelude) await client.query(prelude);
          const res = await client.query(
            `explain (analyze, buffers, format text) delete from ${target.table} where ${PREDICATE(target.retentionDays)}`
          );
          entry[key] = {
            text: res.rows.map((r) => r["QUERY PLAN"]).join("\n"),
            ...classifyPlan(res.rows.map((r) => r["QUERY PLAN"]).join("\n")),
          };
        } catch (error) {
          entry[key] = { text: `ERROR: ${error.message}`, error: error.message };
        } finally {
          await client.query("rollback");
        }
      }
    }

    entry.verdict = verdictFor(entry);
    report.targets.push(entry);
  }

  if (BENCHMARK) {
    try {
      report.benchmark = await benchmark(client, BENCH_ROWS, RETENTION_DAYS + 1, BENCH_TRIALS);
      await client.query("set statement_timeout = '120s'");
    } catch (error) {
      report.benchmark = { error: error.message };
    }
  }

  report.indexesPresent = report.targets.filter((t) => t.indexExists).length;
  report.verified = report.targets.every((t) => t.plan !== null || !t.indexExists);
  report.ok = report.targets.every((t) => t.verdict.status === "ok");
} catch (error) {
  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, fatal: error.message }, null, 2));
  } else {
    console.error(`❌ No se pudo verificar (exit 2): ${error.message}`);
  }
  process.exit(2);
} finally {
  await client.end().catch(() => {});
}

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

const ICON = { ok: "✅", warn: "🟡", fail: "❌" };
console.log(`Índices presentes: ${report.indexesPresent}/${RETENTION_TARGETS.length}\n`);

for (const t of report.targets) {
  console.log(`${ICON[t.verdict.status]} ${t.table}  →  ${t.index}  (ANALYZE ${t.analyzeMs} ms)`);
  if (!t.indexExists) {
    console.log(`   ${t.verdict.reason}`);
    console.log();
    continue;
  }
  console.log(`   def: ${t.indexDef}`);
  console.log(
    `   filas: ${t.totalRows ?? "?"} totales · ${t.expiredRows ?? "?"} con más de ${t.retentionDays} días` +
      (t.expiredPct !== undefined ? ` (${t.expiredPct.toFixed(1)}%)` : "") +
      ` · tamaño: ${(t.sizeBytes / 1024).toFixed(1)} KiB · idx_scan: ${t.idxScan}`
  );
  const access = t.plan?.indexNames.length
    ? `Index Scan using ${t.plan.indexNames.join(", ")}`
    : t.plan?.bitmap
      ? "Bitmap Index Scan"
      : "Seq Scan";
  console.log(`   plan real: ${access} · ${t.plan?.execTime ?? "?"} ms`);
  if (t.forcedPlan) {
    const forced = t.forcedPlan.indexNames.length
      ? `Index Scan using ${t.forcedPlan.indexNames.join(", ")}`
      : "sin uso de índice";
    console.log(`   enable_seqscan=off: ${forced} · ${t.forcedPlan.execTime ?? "?"} ms`);
  }
  console.log(`   veredicto: ${ICON[t.verdict.status]} ${t.verdict.reason}\n`);
}

if (report.benchmark) {
  const b = report.benchmark;
  console.log("─".repeat(72));
  if (b.error) {
    console.log(`🟡 Benchmark no ejecutado: ${b.error}\n`);
  } else {
    const access = (p) =>
      p.indexNames.length
        ? `Index Scan (${p.indexNames.join(", ")})`
        : p.bitmap
          ? "Bitmap Index Scan"
          : "Seq Scan";
    const ratio = b.medianWithoutIndexMs / b.medianWithIndexMs;
    console.log(
      `Benchmark sintético (tablas temporales, ROLLBACK) — ${b.rows.toLocaleString("es")} filas / ${b.days} días · ${b.trials} pasadas`
    );
    console.log(
      `   expiradas por el predicado: ${b.expiredRows.toLocaleString("es")} (${b.expiredPct.toFixed(1)}%)`
    );
    console.log(
      `   sin índice: ${access(b.withoutIndex)} · mediana ${b.medianWithoutIndexMs.toFixed(1)} ms (${b.withoutIndexMs.map((m) => m.toFixed(1)).join(" / ")}) · ${b.withoutIndex.buffers ?? "?"} buffers`
    );
    console.log(
      `   con índice: ${access(b.withIndex)} · mediana ${b.medianWithIndexMs.toFixed(1)} ms (${b.withIndexMs.map((m) => m.toFixed(1)).join(" / ")}) · ${b.withIndex.buffers ?? "?"} buffers`
    );
    console.log(
      `   efecto: ${ratio >= 1 ? ratio.toFixed(2) + "× más rápido con índice" : (1 / ratio).toFixed(2) + "× más rápido SIN índice"} (mediana de ${b.trials} pasadas, no estimación)\n`
    );
  }
}

console.log(
  report.ok
    ? "✅ P2-14 verificado: los 4 índices de retención existen y son usables."
    : "❌ P2-14 con hallazgos: revisar los veredictos ❌/🟡 arriba."
);
process.exit(report.ok ? 0 : 1);
