/* Mapeo slug → fichero de documentación con contención anti-traversal. */

import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "docs");
const DOCS_ROOT = path.resolve(DOCS_DIR);

// Nota: `api` NO está en el SLUG_MAP a propósito. /docs/api es una ruta estática
// dedicada (src/app/docs/api/page.tsx — API Reference interactiva con playground
// y Swagger). Incluirla aquí generaría un static param duplicado para /docs/api,
// rompiendo el build de lambdas de Vercel con "Unable to find lambda for route".
const SLUG_MAP: Record<string, string> = {
  installation: "installation.md",
  security: "security.md",
  changelog: "CHANGELOG.md",
  "architecture/pipeline-history": "architecture/PIPELINE-HISTORY.md",
  "guides/alerting-setup": "guides/alerting-setup.md",
  "improvements/roadmap": "improvements/ROADMAP.md",
  "improvements/competitive-analysis": "improvements/COMPETITIVE-ANALYSIS.md",
};

/**
 * Valida cada segmento del slug antes de tocar el filesystem.
 *
 * Rechaza segmentos vacíos, `.`/`..` (traversal), separadores de ruta
 * (`/`, `\`) y null bytes, de modo que ningún slug puede salirse de DOCS_DIR.
 */
function isSafeSlug(slug: string[]): boolean {
  return (
    slug.length > 0 &&
    slug.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("/") &&
        !segment.includes("\\") &&
        !segment.includes("\0")
    )
  );
}

/** Resuelve `parts` contra DOCS_DIR exigiendo que el resultado quede dentro de DOCS_DIR. */
function resolveWithinDocs(...parts: string[]): string | null {
  const resolved = path.resolve(DOCS_DIR, ...parts);
  if (resolved !== DOCS_ROOT && !resolved.startsWith(DOCS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * Resuelve un slug de `/docs/[...slug]` a un fichero Markdown dentro de `docs/`.
 *
 * Defensa en profundidad: (1) validación de segmentos anti-`..`/separadores y
 * (2) verificación de contención `path.resolve` ⊆ DOCS_DIR antes de `existsSync`.
 *
 * @returns Ruta absoluta existente dentro de `docs/`, o `null` si el slug es
 *   inseguro, no existe o escapa del directorio.
 */
export function resolveFilePath(slug: string[]): string | null {
  if (!isSafeSlug(slug)) return null;

  const mapped = SLUG_MAP[slug.join("/")];
  const candidates: string[] = [];

  if (mapped) {
    const target = resolveWithinDocs(mapped);
    if (target) candidates.push(target);
  } else {
    // Fallback: fichero directo `<slug>.md`
    const direct = resolveWithinDocs(...slug);
    if (direct) candidates.push(`${direct}.md`);
    // Fallback: fichero en subdirectorio `<slug>/index.md`
    const alt = resolveWithinDocs(...slug, "index.md");
    if (alt) candidates.push(alt);
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
