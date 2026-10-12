import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const thrPath = path.join(root, ".rls-surface-threshold.json");
const report = JSON.parse(execSync("node scripts/db/rls-surface-report.mjs --json", { cwd: root, encoding: "utf8" }));
if (!report || !report.archivos) throw new Error("rls-surface-report failed");
const thr = {
  maxDirectDbCalls: report.totales.directDb,
  maxDbCallsOutsideWithRLS: report.totales.dbSinEnvolver,
  maxTotalCalls: report.totales.directDb + report.totales.dbSinEnvolver,
  allowedFiles: report.archivos.map(a => a.archivo),
  baseline: Object.fromEntries(report.archivos.map(a => [a.archivo, { directDb: a.directDb.length, dbSinEnvolver: a.dbSinEnvolver.length }])),
};
const report = JSON.parse(execSync("node scripts/db/rls-surface-report.mjs --json", { cwd: root, encoding: "utf8" }));
if (!report.archivos) throw new Error("report missing archivos");


const map = {};
for (const a of report.archivos) {
  map[a.archivo] = { directDb: a.directDb.length, dbSinEnvolver: a.dbSinEnvolver.length };
}

thr.baseline = map;
thr.maxDirectDbCalls = report.totales.directDb;
thr.maxDbCallsOutsideWithRLS = report.totales.dbSinEnvolver;
thr.maxTotalCalls = report.totales.directDb + report.totales.dbSinEnvolver;
thr.allowedFiles = Array.from(new Set([...thr.allowedFiles, ...report.archivos.map(a => a.archivo)]));

fs.writeFileSync(path.join(root, ".rls-surface-threshold.json"), JSON.stringify(thr, null, 2));
console.log(`updated: files=${report.archivos.length}`);
console.log(`updated: files=${report.archivos.length} total=${report.totales.directDb+report.totales.dbSinEnvolver}`);
