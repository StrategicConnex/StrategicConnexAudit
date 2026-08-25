/**
 * exposure.ts — Checks reales de exposición de archivos sensibles.
 *
 * GET-only contra rutas comúnmente expuestas (.env, .git/HEAD, backups,
 * phpinfo) y detección de directory listing. Cada respuesta 200 con
 * contenido coherente es evidencia REAL de exposición.
 */

import type { CheckContext, CheckDefinition, CheckResult } from "../types";

const SENSITIVE_PATHS: Array<{ path: string; why: string; match?: RegExp; severity: "critical" | "high" | "medium" | "low" }> = [
  { path: "/.env", why: "Variables de entorno (credenciales DB/API)", match: /^[A-Z_]+=|DB_PASSWORD|APP_KEY/m, severity: "critical" },
  { path: "/.git/HEAD", why: "Repositorio git expuesto (código fuente completo descargable)", match: /ref:\s*refs\//i, severity: "critical" },
  { path: "/composer.json", why: "Manifiesto de dependencias PHP (versiones exactas para CVEs)", match: /"require"\s*:/, severity: "high" },
  { path: "/package.json", why: "Manifiesto de dependencias Node", match: /"dependencies"\s*:/, severity: "low" },
  { path: "/backup.sql", why: "Dump de base de datos accesible", match: /CREATE TABLE|INSERT INTO/i, severity: "critical" },
  { path: "/backup.zip", why: "Backup del sitio descargable", match: /^PK\x03\x04/, severity: "critical" },
  { path: "/wp-config.php.bak", why: "Config de WordPress con credenciales", match: /DB_NAME|DB_PASSWORD/, severity: "critical" },
  { path: "/phpinfo.php", why: "phpinfo() expone configuración completa del servidor", match: /phpinfo\(\)|PHP Version/i, severity: "high" },
  { path: "/server-status", why: "Estado de Apache (IPs internas, rutas)", match: /Apache Server Status|Server uptime/i, severity: "medium" },
  { path: "/admin/", why: "Panel de administración accesible sin redirección a login", match: /<title>|login|dashboard|panel/i, severity: "medium" },
];

export const sensitiveFilesCheck: CheckDefinition = {
  id: "sensitive-files",
  name: "Archivos sensibles expuestos",
  category: "exposure",
  description:
    "GET real a rutas críticas comunes (.env, .git, backups…) verificando contenido coherente, no solo status 200.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const exposed: Array<{ path: string; why: string; severity: string; evidence: string }> = [];

    for (const candidate of SENSITIVE_PATHS) {
      try {
        const res = await fetch(`${origin}${candidate.path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        if (res.status !== 200) continue;
        const body = await res.text();
        const contentType = res.headers.get("content-type") ?? "";
        // Un SPA puede devolver index.html para cualquier ruta: exigimos
        // coincidencia de contenido O un content-type que no sea HTML genérico.
        const contentMatched = candidate.match?.test(body) ?? false;
        const isHtmlApp = contentType.includes("text/html") && body.includes("<html");
        if (contentMatched || (!isHtmlApp && body.length > 0 && !contentType.includes("text/html"))) {
          exposed.push({
            path: candidate.path,
            why: candidate.why,
            severity: candidate.severity,
            evidence: `HTTP 200 (${contentType}), primeros bytes: ${body.slice(0, 120).replace(/\n/g, " ")}`,
          });
        }
      } catch {
        /* inaccesible — no es hallazgo */
      }
    }

    if (exposed.length === 0) {
      return {
        id: "sensitive-files",
        name: "Archivos sensibles expuestos",
        status: "pass",
        summary: `Ninguno de ${SENSITIVE_PATHS.length} archivos/rutas sensibles está expuesto.`,
        evidence: { checked: SENSITIVE_PATHS.map((p) => p.path) },
      };
    }

    const worst = exposed.some((e) => e.severity === "critical")
      ? "critical"
      : exposed.some((e) => e.severity === "high")
        ? "high"
        : "medium";

    return {
      id: "sensitive-files",
      name: "Archivos sensibles expuestos",
      status: "finding",
      severity: worst,
      summary: `${exposed.length} archivo(s)/ruta(s) sensible(s) accesibles públicamente.`,
      evidence: { exposed },
    };
  },
};

const LISTING_HINTS = [
  /<title>Index of \//i,
  /<h1>Index of \//i,
  /Directory listing for/i,
  /\[PARENTDIR\]/i,
  /<a href="\/[^"]*">Parent Directory<\/a>/i,
];

export const directoryListingCheck: CheckDefinition = {
  id: "directory-listing",
  name: "Directory listing habilitado",
  category: "exposure",
  description:
    "Comprueba si el servidor lista el contenido de directorios sin archivo índice.",
  run: async ({ origin, fetch, timeoutMs }) => {
    for (const probe of ["/assets/", "/uploads/", "/files/", "/static/"]) {
      try {
        const res = await fetch(`${origin}${probe}`, { signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)) });
        if (res.status !== 200) continue;
        const body = await res.text();
        if (LISTING_HINTS.some((rx) => rx.test(body))) {
          return {
            id: "directory-listing",
            name: "Directory listing habilitado",
            status: "finding",
            severity: "medium",
            summary: `${probe} devuelve un listado de directorios navegable.`,
            evidence: { path: probe, snippet: body.slice(0, 300) },
          };
        }
      } catch {
        /* siguiente */
      }
    }
    return {
      id: "directory-listing",
      name: "Directory listing habilitado",
      status: "pass",
      summary: "Sin directory listing detectable en rutas comunes.",
      evidence: {},
    };
  },
};

/** Helper reutilizable por otros checks para un GET simple con captura. */
export async function getWithCapture(
  ctx: CheckContext,
  path: string
): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
  try {
    const res = await ctx.fetch(`${ctx.origin}${path}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const body = (await res.text()).slice(0, 20_000);
    return { status: res.status, headers, body };
  } catch {
    return null;
  }
}

export type { CheckResult };
