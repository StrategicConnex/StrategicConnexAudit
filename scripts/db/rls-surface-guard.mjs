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
   - cualquier archivo presente en baseline CAMBIA su conteo (delta != 0),
     también si baja: una mejora se consolida con --snapshot en su commit
   - un archivo del baseline DESAPARECE del conteo (baja a 0 llamadas). Ese caso
     —la migración completa de un servicio— era invisible hasta el 2026-10-13:
     el gate iteraba solo los archivos medidos, así que el baseline se quedaba
     por encima del árbol y el gate decía «OK» con totales que no cuadraban.
     La comparación vive en rls-surface-patterns.mjs (diffBaseline).

   QUÉ CUENTA (y qué dejó de escaparse el 2026-10-13): el patrón tolera el salto
   de línea (`directDb` + `.select()` en la línea siguiente), que es el estilo
   dominante en este repo. Antes exigía el punto pegado al identificador, así que
   190 de 330 llamadas reales —y cualquier sitio NUEVO escrito así— eran
   invisibles para el gate. El conteo vive en rls-surface-patterns.mjs, compartido
   con el informe para que ambos no puedan divergir.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { countSurface, diffBaseline, formatDiscrepancy } from "./rls-surface-patterns.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/* ── conteo léxico (patrón compartido con el informe) ──────────────────── */
function count() {
  const root = path.resolve(__dirname, "..", "..");
  const { archivos, totales } = countSurface(path.join(root, "src"), root);
  return {
    archivos: archivos.map((a) => ({
      archivo: a.archivo,
      directDb: a.directDb.length,
      dbSinEnvolver: a.dbSinEnvolver.length,
    })),
    totales,
  };
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
  // Un newline final evita que prettier reporte falta de línea final y que el
  // siguiente snapshot lo vuelva a quitar; el resto del archivo es solo
  // estados, no se serializa.
  fs.writeFileSync(
    path.join(root, ".rls-surface-threshold.json"),
    JSON.stringify(thr, null, 2) + "\n",
  );
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
      discrepancies: diffBaseline(baseline, archivosAhora).map((d) => ({
        archivo: d.archivo,
        tipo: d.tipo,
        baseline: d.antes,
        now: d.ahora,
        delta: d.delta,
      })),
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

for (const d of diffBaseline(baseline, archivosAhora)) {
  failed = true;
  errors.push(formatDiscrepancy(d));
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
