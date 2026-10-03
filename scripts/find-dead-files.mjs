#!/usr/bin/env node
/**
 * Detector CONSERVADOR de ficheros muertos.
 *
 * Criterio: un fichero de src/ es "candidato" a código muerto si
 *   1. NO es un fichero de convención de Next.js (route/page/layout/…),
 *   2. NO vive bajo src/app/ (todo lo que hay ahí lo enruta el framework),
 *   3. no lo importa NINGÚN fichero del proyecto (src/, e2e/, tests/,
 *      scripts/, configs de la raíz).
 *
 * A diferencia de una búsqueda por subcadena, aquí se RESUELVEN de verdad
 * los specifiers de import: tanto alias `@/x` como relativos `./x`, probando
 * las extensiones reales (.ts/.tsx/index.ts/index.tsx). Un `import ... from
 * './tabs/OverviewTab'` resuelve exactamente al fichero, sin heurísticas.
 *
 * Uso: node scripts/find-dead-files.mjs [--verbose]
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, normalize } from "node:path";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");
const VERBOSE = process.argv.includes("--verbose");

const NEXT_CONVENTION = new Set([
  "page", "layout", "route", "loading", "error", "not-found", "template",
  "default", "global-error", "middleware", "proxy", "instrumentation",
  "global", "favicon", "sitemap", "robots", "manifest", "opengraph-image",
  "icon", "apple-icon", "twitter-image",
]);

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", ".trigger"]);
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f));

const corpus = [
  ...walk(SRC),
  ...walk(join(ROOT, "e2e")),
  ...walk(join(ROOT, "tests")),
  ...walk(join(ROOT, "scripts")),
  ...["playwright.config.ts", "drizzle.config.ts", "trigger.config.ts", "vitest.config.ts", "next.config.ts"]
    .map((f) => join(ROOT, f)),
].filter((p) => existsSync(p));

// ─── Resolver CADA specifier de import a una ruta real ──────────────────────
const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
const resolved = new Set(); // rutas absolutas normalizadas que alguien importa

for (const file of corpus) {
  if (!/\.(ts|tsx|mjs|cjs|js)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    let base;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(file), spec);
    else continue; // paquete de npm: no nos interesa para este análisis
    for (const ext of EXTS) {
      const candidate = normalize(base + ext);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        resolved.add(candidate);
        break;
      }
    }
  }
}

// ─── Clasificar ─────────────────────────────────────────────────────────────
const dead = [];
for (const file of srcFiles) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const base = rel.split("/").pop();
  const nameNoExt = base.replace(/\.tsx?$/, "");

  if (NEXT_CONVENTION.has(nameNoExt)) continue; // lo carga el framework
  if (rel.startsWith("src/app/")) continue;       // todo src/app/ lo enruta Next
  if (/\.(test|spec)\.tsx?$/.test(base)) continue; // los descubre vitest
  if (resolved.has(normalize(file))) continue;      // alguien lo importa

  dead.push({ rel, size: statSync(file).size });
}

dead.sort((a, b) => b.size - a.size);
console.log(`Ficheros de src/ sin ningún import: ${dead.length} / ${srcFiles.length}`);
for (const d of dead) console.log(`  ${d.rel}  (${d.size} B)`);