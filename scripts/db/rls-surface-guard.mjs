#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Guard anti-regresión de superficie RLS (P0.2-A)
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(abs);
    } else if (/\\.(ts|tsx)$/.test(entry.name) && !/\\.(test|spec)\\.(ts|tsx)$/.test(entry.name)) {
      yield abs;
    }
  }
}

const RE_DIRECT = /(?<![\\w.])directDb\\.(query|insert|update|delete|select|execute|transaction|\\$count)/g;
const RE_BARE = /(?<![\\w.$])db\\.(query|insert|update|delete|select|execute|transaction)/g;

const lineOf = (src, index) => src.slice(0, index).split(/\\r?\\n/).length;

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
    { directDb: 0, dbSinEnvolver: 0 }
  );
  return { archivos, totales };
}

const root = path.resolve(__dirname, "..", "..");
let threshold;
try {
  threshold = JSON.parse(fs.readFileSync(path.join(root, ".rls-surface-threshold.json"), "utf8"));
} catch (e) {
  console.error("Cannot read .rls-surface-threshold.json:", e.message);
  process.exit(2);
}
const { archivos, totales } = count();
const total = totales.directDb + totales.dbSinEnvolver;
const allowed = new Set(threshold.allowedFiles || []);
const baseline = threshold.baseline || {};

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

for (const a of archivos) {
  if (!allowed.has(a.archivo)) {
    failed = true;
    errors.push(`ARCHIVO NUEVO (no permitido): ${a.archivo} [directDb:${a.directDb} db:${a.dbSinEnvolver}]`);
    continue;
  }
  const bl = baseline[a.archivo];
  if (bl) {
    if (a.directDb > bl.directDb || a.dbSinEnvolver > bl.dbSinEnvolver) {
      failed = true;
      errors.push(`INCREMENTO en permitido: ${a.archivo} [directDb:${a.directDb}/${bl.directDb} db:${a.dbSinEnvolver}/${bl.dbSinEnvolver}]`);
    }
  }
}

if (failed) {
  console.error("❌ RLS surface guard: se detectó regresión\\n");
  for (const e of errors) console.error(`   - ${e}`);
  console.error("\\n💡 Para añadir una llamada cruda, actualiza .rls-surface-threshold.json con justificación en el commit");
  process.exit(1);
}

console.log("✅ RLS surface guard: OK");
console.log(`   directDb: ${totales.directDb}/${threshold.maxDirectDbCalls} | dbSinEnvolver: ${totales.dbSinEnvolver}/${threshold.maxDbCallsOutsideWithRLS} | total: ${total}/${threshold.maxTotalCalls} | archivos: ${archivos.length}`);
process.exit(0);
