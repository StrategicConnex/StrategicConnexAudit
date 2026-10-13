#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard anti-regresión de superficie RLS (P0.2-A)

   REGLA DE ORO: cualquier aumento en cualquier archivo es exit 1, incluso si
   el total sigue bajo el umbral. La única forma de que pase es mantener
   EXACTAMENTE igual cada conteo individual (o reducirlo). Requiere snapshot
   basal via --snapshot/-s que actualiza .rls-surface-threshold.json.

   Uso normal (gate):
     node scripts/db/rls-surface-guard.mjs        # verifica contra baseline
     pnpm db:rls-surface-guard                     # igual, vía package.json

   Diagnosticar discrepancias (no falla, solo informa):
     node scripts/db/rls-surface-guard.mjs --print-baseline

   Actualizar baseline después de una migración aprobada:
     node scripts/db/rls-surface-guard.mjs --snapshot
     node scripts/db/rls-surface-guard.mjs -s

   Falla en:
   - total supera los máximos declarados
   - aparece un archivo nuevo no en baseline (no requiere allowlist manual)
   - cualquier archivo con presente en baseline incrementa su conteo (delta != 0)
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/* ── árbol ────────────────────────────────────────────────────────────── */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(abs);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      yield abs;
    }
  }
}

/* ──正規表現 counts ────────────────────────────────────────────────────── */
const RE_DIRECT = /(?<![\\w.])directDb\.(query|insert|update|delete|select|execute|transaction|\$count)/g;
const RE_BARE = /(?<![\\w.$])db\.(query|insert|update|delete|select|execute|transaction)/g;

const lineOf = (src, index) => src.slice(0, index).split(/\r?\n/).length;

/* ── conteo léxico ─────────────────────────────────────────────────────── */
function count() {
  const archivos = [];
  for (const abs of walk(path.resolve(__dirname, "..", "..", "src"))) {
    const rel = path.relative(path.resolve(__dirname, "..", ".."), abs).split(path.sep).join("/");
    const src = fs.readFileSync(abs, "utf8");
    const directas = [...src.matchAll(RE_DIRECT)].map((m) => lineOf(src, m.index));
    const crudas = [...src.matchAll(RE_BARE)].map((m) => lineOf(src, m.index));
    if (directas.length === 0 && crudas.length === 0) continue;
    archivos.push({ archivo: rel, directDb: directas.length, dbSinEnvolver: crudas.length });
  }
  const totales = archivos.reduce(
    (a, b) => ({ directDb: a.directDb + b.directDb, dbSinEnvolver: a.dbSinEnvolver + b.dbSinEnvolver }),
    { directDb: 0, dbSinEnvolver: 0 },
  );
  return { archivos, totales };
}

/* ── snapshot ──────────────────────────────────────────────────────────── */
function snapshotFull() {
  const root = path.resolve(__dirname, "..", "..");
  const { archivos, totales } = count();
  const map = {};
  for (const a of archivos) {
    map[a.archivo] = { directDb: a.directDb, dbSinEnvolver: a.dbSinEnvolver };
  }
  const thr = {
    maxDirectDbCalls: totales.directDb,
    maxDbCallsOutsideWithRLS: totales.dbSinEnvolver,
    maxTotalCalls: totales.directDb + totales.dbSinEnvolver,
    allowedFiles: archivos.map((a) => a.archivo),   // opcional, mantenido por compatibilidad
    baseline: map,
  };
  fs.writeFileSync(path.join(root, ".rls-surface-threshold.json"), JSON.stringify(thr, null, 2));
  console.log(`Snapshot: ${archivos.length} archivos · maxDirectDb=${thr.maxDirectDbCalls} maxDb=${thr.maxDbCallsOutsideWithRLS} maxTotal=${thr.maxTotalCalls}`);
}

const SNAPSHOT = process.argv.includes("--snapshot") || process.argv.includes("-s");
const PRINT_BASELINE = process.argv.includes("--print-baseline") || process.argv.includes("--pb");
const ROOT = path.resolve(__dirname, "..", "..");

if (SNAPSHOT) { snapshotFull(); process.exit(0); }

/* ── gate ──────────────────────────────────────────────────────────────── */
let threshold;
try {
  threshold = JSON.parse(fs.readFileSync(path.join(ROOT, ".rls-surface-threshold.json"), "utf8"));
} catch (e) {
  console.error("Cannot read .rls-surface-threshold.json:", e.message);
  process.exit(2);
}

const { archivos: archivosAhora, totales } = count();
const total = totales.directDb + totales.dbSinEnvolver;
const baseline = threshold.baseline || {};

if (PRINT_BASELINE) {
  console.log(JSON.stringify(
    {
      baselineFiles: Object.keys(baseline).length,
      actualFiles: archivosAhora.length,
      discrepancies: archivosAhora.map(a => {
        const bl = baseline[a.archivo];
        return bl != null
          ? { archivo: a.archivo, baseline: bl, now: { directDb: a.directDb, dbSinEnvolver: a.dbSinEnvolver }, delta: { directDb: a.directDb - bl.directDb, dbSinEnvolver: a.dbSinEnvolver - bl.dbSinEnvolver } }
          : { archivo: a.archivo, baseline: null, now: { directDb: a.directDb, dbSinEnvolver: a.dbSinEnvolver }, delta: null };
      }),
      totals: { baselineExpected: threshold.maxTotalCalls ?? null, actualTotal: total },
      allowedFilesCount: (threshold.allowedFiles ?? []).length,
    },
    null,
    2,
  ));
  process.exit(0);
}

let failed = false;
const errors = [];

if (totales.directDb > threshold.maxDirectDbCalls) {
  failed = true;
  errors.push(`directDb supera umbral: ${totales.directDb} > ${threshold.maxDirectDbCalls}`);
}
if (totales.dbSinEnvolver > threshold.maxDbCallsOutsideWithRLS) {
  failed = true;
  errors.push(`dbSinEnvolver supera umbral: ${totales.dbSinEnvolver} > ${threshold.maxDbCallsOutsideWithRLS}`);
}
if (total > threshold.maxTotalCalls) {
  failed = true;
  errors.push(`TOTAL supera umbral: ${total} > ${threshold.maxTotalCalls}`);
}

for (const a of archivosAhora) {
  const bl = baseline[a.archivo];
  if (bl === undefined) {
    failed = true;
    errors.push(`ARCHIVO NUEVO (sin baseline): ${a.archivo} [directDb:${a.directDb} db:${a.dbSinEnvolver}]`);
    continue;
  }
  if (a.directDb !== bl.directDb || a.dbSinEnvolver !== bl.dbSinEnvolver) {
    const deltaDirect = a.directDb - bl.directDb;
    const deltaDb = a.dbSinEnvolver - bl.dbSinEnvolver;
    failed = true;
    errors.push(
      `INCREMENTO en archivo: ${a.archivo} [antes ${bl.directDb}/${bl.dbSinEnvolver} → ahora ${a.directDb}/${a.dbSinEnvolver} (Δ ${deltaDirect ? (deltaDirect > 0 ? "+" : "") + deltaDirect : "0"} / ${deltaDb ? (deltaDb > 0 ? "+" : "") + deltaDb : "0"})]`,
    );
  }
  // exact match → pasa, incluso si no estaba en allowedFiles
}

if (failed) {
  console.error("❌ RLS surface guard: se detectó regresión\n");
  for (const e of errors) console.error(`   - ${e}`);
  console.error("\n💡 Para añadir una llamada cruda, actualiza .rls-surface-threshold.json con justificación en el commit");
  process.exit(1);
}

console.log("✅ RLS surface guard: OK — superficie congelada (no se permiten aumentos ni archivos nuevos)");
console.log(`   directDb: ${totales.directDb}/${threshold.maxDirectDbCalls} | dbSinEnvolver: ${totales.dbSinEnvolver}/${threshold.maxDbCallsOutsideWithRLS} | total: ${total}/${threshold.maxTotalCalls} | archivos: ${archivosAhora.length}`);
process.exit(0);
