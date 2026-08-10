#!/usr/bin/env node
/**
 * VULN-010 guard — bundle cliente sin CDNs de terceros
 * ----------------------------------------------------
 * FALLA el CI si el bundle cliente compilado (.next) contiene URLs de CDNs
 * de terceros. Cada una de estas URLs era una fuga real de datos hacia
 * servidores ajenos (IP + referrer + contexto de la investigación):
 *
 *   - unpkg.com              → era el CDN de web-vitals (vitals.js) y de los
 *                              markers de Leaflet en GeoMap.
 *   - cdn.jsdelivr.net       → era el CDN de mermaid (docs/html).
 *   - cartocdn.com           → era el tile layer de GeoMap (fugaba la región
 *                              geográfica investigada — VULN-010 crítica).
 *   - fonts.googleapis.com / fonts.gstatic.com → era el font CDN de los PDFs
 *                              exportados (generados en el navegador).
 *
 * Escanea exactamente la salida que VIAJA al navegador:
 *   - .next/static/**        (chunks JS del cliente + media)
 *   - .next/server/app/**    (HTML SSR + payloads RSC que se envían al cliente)
 *
 * Los comentarios de fuente no disparan el guard: el minificador los elimina
 * del bundle. Solo una string literal real (un fetch, un <link>, un import
 * dinámico...) llega al .next y es lo que este guard detecta.
 *
 * Uso:
 *   node scripts/guard-client-cdns.mjs        # exit 0 = OK, 1 = violación
 *   pnpm guard:cdn
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Dominios de CDNs de terceros prohibidos en el bundle cliente. */
export const FORBIDDEN_CDNS = [
  "unpkg.com",
  "cdn.jsdelivr.net",
  "cartocdn.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

/** Recorre `dir` recursivamente y devuelve las rutas de archivo. */
export function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Escanea una lista de archivos y devuelve las violaciones
 * [{ file, found: string[] }]. Ignora source maps (pueden contener
 * comentarios de fuente originales que el bundle minificado no incluye).
 */
export function scanFilesForCdns(files) {
  const violations = [];
  for (const file of files) {
    if (file.endsWith(".map")) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue; // binarios/locks — no son texto escaneable
    }
    const lower = content.toLowerCase();
    const found = FORBIDDEN_CDNS.filter((cdn) => lower.includes(cdn));
    if (found.length > 0) violations.push({ file, found });
  }
  return violations;
}

/**
 * Escanea el bundle cliente compilado (.next). Lanza un error si no hay
 * build — es una barrera post-build: un build ausente es configuración rota.
 */
export function scanClientBundle() {
  const staticDir = path.join(ROOT, ".next", "static");
  const serverAppDir = path.join(ROOT, ".next", "server", "app");
  if (!fs.existsSync(staticDir)) {
    throw new Error(
      "No hay build cliente: corre `pnpm build` antes de ejecutar el guard de CDNs (VULN-010)."
    );
  }
  return scanFilesForCdns([...walkFiles(staticDir), ...walkFiles(serverAppDir)]);
}

/** True solo cuando el script se ejecuta directamente (no al ser importado). */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    const violations = scanClientBundle();
    if (violations.length > 0) {
      console.error(
        "❌ VULN-010 VIOLATION (guard-client-cdns): el bundle cliente referencia CDNs de terceros:"
      );
      for (const v of violations) {
        const rel = path.relative(ROOT, v.file).split(path.sep).join("/");
        console.error(`   - ${rel} → ${v.found.join(", ")}`);
      }
      console.error(
        "\nEstas URLs exfiltran IP/referrer/geolocalización a servidores ajenos. Self-hosteá el recurso (ver VULN-010 en docs/security/SECURITY-AUDIT-REPORT.md)."
      );
      process.exit(1);
    }
    console.log("✅ VULN-010 OK: el bundle cliente no referencia CDNs de terceros.");
  } catch (err) {
    console.error("❌ " + err.message);
    process.exit(1);
  }
}
