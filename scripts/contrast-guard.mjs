/**
 * contrast-guard.mjs — QW5 paleta: falla si un token de texto baja de 4.5:1.
 *
 * Lee los OKLCH de src/app/globals.css, convierte a sRGB lineal y calcula
 * ratios WCAG contra su fondo. Pares declarados abajo (texto light/dark +
 * pares botón). Los tokens decorativos (grid, glow) están excluidos a
 * propósito. Zero-deps para CI.
 *
 * Uso: node scripts/contrast-guard.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

// Extrae el bloque :root dark (antes de [data-theme="light"]).
const darkBlock = css.split('[data-theme="light"]')[0];
const lightBlock = css.split('[data-theme="light"]')[1].split("/* ─── Red neuronal")[0];

function token(block, name) {
  const m = block.match(new RegExp(`--${name}:\\s*oklch\\(([^)]+)\\)`));
  if (!m) throw new Error(`token no encontrado: ${name}`);
  const [l, c, h] = m[1].trim().split(/\s+/).map((v) => parseFloat(v));
  return [l / 100, c, h];
}

function lin([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x) => Math.min(Math.max(x, 0), 1);
  return [
    clamp(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const lum = (o) => {
  const [r, g, b] = lin(o);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (f, b) => {
  const hi = Math.max(lum(f), lum(b));
  const lo = Math.min(lum(f), lum(b));
  return (hi + 0.05) / (lo + 0.05);
};

// [nombre, tokenTexto, tokenFondo, bloque, mínimo]
const PAIRS = [
  ["dark fg/bg", "fg", "bg", "dark", 4.5],
  ["dark muted-fg/bg", "muted-fg", "bg", "dark", 4.5],
  ["dark primary texto/bg", "primary", "bg", "dark", 4.5],
  ["dark primary-fg/primary (botón)", "primary-fg", "primary", "dark", 4.5],
  ["dark chartreuse/bg", "chartreuse", "bg", "dark", 4.5],
  ["dark destructive/bg", "destructive", "bg", "dark", 4.5],
  ["dark accent/bg", "accent", "bg", "dark", 4.5],
  ["dark chart-label/bg", "chart-label", "bg", "dark", 4.5],
  ["light fg/bg", "fg", "bg", "light", 4.5],
  ["light muted-fg/bg", "muted-fg", "bg", "light", 4.5],
  ["light primary-fg/primary (botón)", "primary-fg", "primary", "light", 4.5],
  ["light destructive/bg", "destructive", "bg", "light", 4.5],
];

let fail = 0;
for (const [name, ft, bt, theme, min] of PAIRS) {
  const block = theme === "dark" ? darkBlock : lightBlock;
  const r = ratio(token(block, ft), token(block, bt));
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${r.toFixed(2)}:1  ${ok ? "OK  " : "FAIL"}  ${name} (mín ${min})`);
}

if (fail > 0) {
  console.error(`contrast-guard: ${fail} par(es) bajo el umbral`);
  process.exit(1);
}
console.log("contrast-guard: OK");
