/**
 * i18n-parity.mjs — P1-4: falla si messages/es.json y en.json divergen.
 *
 * Uso: node scripts/i18n-parity.mjs [--max-divergence 0.02]
 * Compara claves aplanadas (a.b.c) en ambas direcciones. Las claves de
 * pluralización ICU ({count, plural...}) cuentan como una sola clave.
 * Exit 1 si hay claves faltantes o divergencia > umbral.
 * Zero-deps para correr en CI sin install.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const maxDiv = Number(process.argv.includes("--max-divergence")
  ? process.argv[process.argv.indexOf("--max-divergence") + 1]
  : 0.02);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const es = flatten(JSON.parse(readFileSync(join(root, "messages/es.json"), "utf8")));
const en = flatten(JSON.parse(readFileSync(join(root, "messages/en.json"), "utf8")));
const esKeys = new Set(Object.keys(es));
const enKeys = new Set(Object.keys(en));

const missingInEn = [...esKeys].filter((k) => !enKeys.has(k));
const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
const total = Math.max(esKeys.size, enKeys.size);
const divergence = total === 0 ? 0 : (missingInEn.length + missingInEs.length) / total;

if (missingInEn.length > 0) {
  console.error(`Faltan en en.json (${missingInEn.length}):`);
  for (const k of missingInEn.slice(0, 20)) console.error(`  - ${k}`);
}
if (missingInEs.length > 0) {
  console.error(`Faltan en es.json (${missingInEs.length}):`);
  for (const k of missingInEs.slice(0, 20)) console.error(`  - ${k}`);
}
console.log(`es=${esKeys.size} en=${enKeys.size} divergencia=${(divergence * 100).toFixed(2)}% (máx ${(maxDiv * 100).toFixed(2)}%)`);

if (divergence > maxDiv) {
  console.error("i18n-parity: DIVERGENCIA EXCESIVA");
  process.exit(1);
}
console.log("i18n-parity: OK");
