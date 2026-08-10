/**
 * VULN-010 — test de regresión: sin CDNs de terceros en el cliente.
 * -----------------------------------------------------------------
 * Verifica que el código que viaja al navegador no referencia URLs de CDNs
 * de terceros (unpkg, jsdelivr, cartocdn, Google Fonts) que exfiltrarían
 * IP/referrer/geolocalización a servidores ajenos (ver SECURITY-AUDIT-REPORT
 * VULN-010: tiles de cartocdn, markers/web-vitals de unpkg, fonts de Google).
 *
 * Nivel 1 (siempre): escaneo del código fuente cliente (src/ + public/).
 *   - Los comentarios se eliminan ANTES de escanear porque el minificador los
 *     elimina del bundle: un comentario explicativo no es una petición real.
 * Nivel 2 (si hay build): escaneo del bundle compilado (.next/static +
 *   .next/server/app) con la misma lógica del guard de CI. Se omite si no hay
 *   build local; en CI la barrera dura post-build es `pnpm guard:cdn`
 *   (scripts/guard-client-cdns.mjs).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN_CDNS, walkFiles, scanClientBundle } from "../../scripts/guard-client-cdns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Elimina comentarios JS/TS/CSS sin romper URLs (https://...). */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])[ \t]*\/\/.*$/gm, "$1");
}

function formatViolations(violations: { file: string; found: string[] }[]): string {
  if (violations.length === 0) return "";
  return (
    "CDNs de terceros encontradas:\n" +
    violations
      .map(
        (v) =>
          `  - ${path.relative(ROOT, v.file).split(path.sep).join("/")} → ${v.found.join(", ")}`
      )
      .join("\n")
  );
}

describe("VULN-010 · sin CDNs de terceros en el cliente", () => {
  it("el código fuente cliente (src/ + public/) no referencia CDNs de terceros", () => {
    const files = [...walkFiles(path.join(ROOT, "src")), ...walkFiles(path.join(ROOT, "public"))].filter(
      (f) => /\.(ts|tsx|mjs|js|jsx|css|html)$/.test(f)
    );

    const violations = [];
    for (const file of files) {
      const content = stripComments(fs.readFileSync(file, "utf-8")).toLowerCase();
      const found = FORBIDDEN_CDNS.filter((cdn) => content.includes(cdn));
      if (found.length > 0) violations.push({ file, found });
    }

    expect(violations, formatViolations(violations)).toEqual([]);
  });

  const hasBuild = fs.existsSync(path.join(ROOT, ".next", "static"));
  it.skipIf(!hasBuild)(
    "el bundle compilado (.next) no contiene URLs de CDNs de terceros",
    () => {
      const violations = scanClientBundle();
      expect(violations, formatViolations(violations)).toEqual([]);
    }
  );
});
