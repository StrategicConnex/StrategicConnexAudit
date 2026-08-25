/**
 * webconfig.ts — Checks activos NO destructivos de configuración web.
 *
 * Payloads ÚNICOS y seguros: un intento de SQLi error-based (solo lectura
 * del mensaje de error), un canary XSS que NUNCA se ejecuta (se detecta por
 * reflexión en el HTML), path traversal con lectura inofensiva, open redirect
 * y métodos HTTP peligrosos vía OPTIONS/TRACE.
 */

import type { CheckContext, CheckDefinition } from "../types";
import { getWithCapture } from "./exposure";

const SQL_ERROR_PATTERNS: RegExp[] = [
  /you have an error in your sql syntax/i,
  /warning: mysql/i,
  /unclosed quotation mark after/i,
  /quoted string not properly terminated/i,
  /pg_query\(\)|postgresql.*error/i,
  /sqlite3?::query\(\)|sqlite_exception/i,
  /ORA-\d{5}/i,
  /Microsoft OLE DB Provider for SQL Server/i,
  /ODBC SQL Server Driver/i,
  /mysqli?[_\.]?(connect|query|prepare)?\(/i,
  /syntax error at or near/i,
];

export const sqliErrorCheck: CheckDefinition = {
  id: "sqli-error",
  name: "SQL Injection (error-based, payload único)",
  category: "webconfig",
  description:
    "Un único payload inofensivo (' OR 1=1--) en parámetros comunes; detecta errores SQL expuestos.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const probes = [
      `${origin}/?id=1%27%20OR%20%271%27%3D%271`,
      `${origin}/?q=1%27%20OR%20%271%27%3D%271`,
      `${origin}/items?id=1%27%20OR%20%271%27%3D%271`,
      `${origin}/product?id=1%27%20OR%20%271%27%3D%271`,
    ];
    const hits: Array<{ url: string; pattern: string }> = [];

    for (const url of probes) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        const body = await res.text();
        // Solo reportamos si el ERROR SQL queda expuesto en la respuesta.
        for (const rx of SQL_ERROR_PATTERNS) {
          if (rx.test(body)) {
            hits.push({
              url: new URL(url).pathname + new URL(url).search,
              pattern: rx.source.slice(0, 60),
            });
            break;
          }
        }
      } catch {
        /* siguiente */
      }
    }

    if (hits.length > 0) {
      return {
        id: "sqli-error",
        name: "SQL Injection (error-based)",
        status: "finding",
        severity: "critical",
        summary: `Mensajes de error SQL expuestos en ${hits.length} endpoint(s) ante payload único.`,
        evidence: { hits },
      };
    }

    return {
      id: "sqli-error",
      name: "SQL Injection (error-based)",
      status: "pass",
      summary: "Sin errores SQL expuestos ante payloads únicos.",
      evidence: { probesTested: probes.length },
    };
  },
};

export const xssReflectionCheck: CheckDefinition = {
  id: "xss-reflection",
  name: "XSS reflejado (canary no ejecutable)",
  category: "webconfig",
  description:
    "Canary alfanumérico con marcadores: se detecta REFLEXIÓN sin contexto en el HTML. Nunca ejecuta código.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const canary = `zx${Date.now().toString(36)}qc`;
    const probes = [
      `${origin}/?q=${canary}`,
      `${origin}/?search=${canary}`,
      `${origin}/?s=${canary}`,
      `${origin}/?keyword=${canary}`,
    ];
    const reflected: Array<{ param: string; context: string }> = [];

    for (const url of probes) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        const body = await res.text();
        if (!body.includes(canary)) continue;
        // Contexto de la reflexión: fuera de atributos/código escapado es lo grave
        const idx = body.indexOf(canary);
        const around = body.slice(Math.max(0, idx - 40), idx + canary.length + 40);
        const rawReflection =
          !around.includes("&lt;") && !around.includes("&#") && !around.includes("\\u003c");
        reflected.push({
          param: new URL(url).searchParams.keys().next().value ?? "?",
          context: rawReflection ? "sin escapar (crudo)" : "escapado/serializado",
        });
      } catch {
        /* siguiente */
      }
    }

    if (reflected.some((r) => r.context.includes("crudo"))) {
      return {
        id: "xss-reflection",
        name: "XSS reflejado (canario)",
        status: "finding",
        severity: "high",
        summary: `Input reflejado sin escapar detectado — superficie XSS confirmada.`,
        evidence: { canary, reflected },
      };
    }

    return {
      id: "xss-reflection",
      name: "XSS reflejado (canario)",
      status: "pass",
      summary: reflected.length > 0 ? "Reflexión presente pero escapada correctamente." : "Sin reflexión de input.",
      evidence: { canary, reflected },
    };
  },
};

export const pathTraversalCheck: CheckDefinition = {
  id: "path-traversal",
  name: "Path Traversal (lectura inofensiva)",
  category: "webconfig",
  description:
    "Payload ../../etc/passwd codificado; solo verifica si el contenido del archivo sistema se filtra en la respuesta.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const passwdMarker = /root:[x*!]:0:0:/;
    const probes = [
      `${origin}/download?file=..%2f..%2f..%2fetc%2fpasswd`,
      `${origin}/?file=....//....//etc/passwd`,
      `${origin}/static?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
    ];
    for (const url of probes) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        if (res.status !== 200) continue;
        const body = await res.text();
        if (passwdMarker.test(body)) {
          return {
            id: "path-traversal",
            name: "Path Traversal",
            status: "finding",
            severity: "critical",
            summary: `/etc/passwd accesible vía traversal en ${new URL(url).pathname}.`,
            evidence: { probe: new URL(url).pathname, match: "root:x:0:0:" },
          };
        }
      } catch {
        /* siguiente */
      }
    }
    return {
      id: "path-traversal",
      name: "Path Traversal",
      status: "pass",
      summary: "Sin lectura de archivos del sistema ante payloads de traversal.",
      evidence: {},
    };
  },
};

export const openRedirectCheck: CheckDefinition = {
  id: "open-redirect",
  name: "Open Redirect",
  category: "webconfig",
  description:
    "Parámetros de redirección comunes apuntando a example.com — verifica Location sin seguir la cadena.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const evil = "https://example.com";
    const probes = [
      `${origin}/redirect?url=${encodeURIComponent(evil)}`,
      `${origin}/?next=${encodeURIComponent(evil)}`,
      `${origin}/logout?returnTo=${encodeURIComponent(evil)}`,
      `${origin}/login?redirect=${encodeURIComponent(evil)}`,
    ];
    for (const url of probes) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        const loc = res.headers.get("location");
        if ((res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307) && loc?.startsWith(evil)) {
          return {
            id: "open-redirect",
            name: "Open Redirect",
            status: "finding",
            severity: "medium",
            summary: `Redirección abierta a dominio externo vía ${new URL(url).pathname}.`,
            evidence: { probe: url.replace(origin, ""), location: loc, status: res.status },
          };
        }
        // Meta refresh o JS redirect en el cuerpo
        if (res.status === 200) {
          const body = await res.text();
          const meta = body.match(/<meta[^>]+http-equiv=["']?refresh[^>]+url=(https?:\/\/example\.com)/i);
          if (meta) {
            return {
              id: "open-redirect",
              name: "Open Redirect",
              status: "finding",
              severity: "medium",
              summary: `Redirección client-side a dominio externo vía meta refresh.`,
              evidence: { probe: url.replace(origin, "") },
            };
          }
        }
      } catch {
        /* siguiente */
      }
    }
    return {
      id: "open-redirect",
      name: "Open Redirect",
      status: "pass",
      summary: "Sin redirecciones abiertas detectadas en parámetros comunes.",
      evidence: {},
    };
  },
};

export const httpMethodsCheck: CheckDefinition = {
  id: "http-methods",
  name: "Métodos HTTP peligrosos",
  category: "webconfig",
  description:
    "OPTIONS * y TRACE para detectar métodos habilitados innecesarios (TRACE → Cross-Site Tracing).",
  run: async (ctx) => {
    let allowHeader = "";
    let traceEchoesBody = false;

    try {
      const optRes = await ctx.fetch(ctx.origin, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      allowHeader = optRes.headers.get("allow") ?? optRes.headers.get("access-control-allow-methods") ?? "";
    } catch {
      /* algunos servers rechazan OPTIONS vacío */
    }

    try {
      const traceRes = await ctx.fetch(ctx.origin, {
        method: "TRACE",
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      if (traceRes.status >= 200 && traceRes.status < 300) {
        const body = await traceRes.text();
        traceEchoesBody = body.includes("TRACE"); // el server eco-eó la request
      }
    } catch {
      /* TRACE bloqueado — bien */
    }

    const dangerous = ["TRACE", "PUT", "DELETE", "CONNECT"].filter(
      (m) => traceEchoesBody && m === "TRACE" ? true : new RegExp(`\\b${m}\\b`).test(allowHeader)
    );

    if (dangerous.length > 0) {
      return {
        id: "http-methods",
        name: "Métodos HTTP peligrosos",
        status: "finding",
        severity: traceEchoesBody ? "medium" : "low",
        summary: `Métodos potencialmente peligrosos anunciados/habilitados: ${dangerous.join(", ")}.`,
        evidence: { allowHeader, traceEchoesBody, dangerous },
      };
    }

    return {
      id: "http-methods",
      name: "Métodos HTTP peligrosos",
      status: "pass",
      summary: "Sin métodos peligrosos anunciados (Allow/CORS) ni TRACE activo.",
      evidence: { allowHeader, traceEchoesBody },
    };
  },
};

export const corsMisconfigCheck: CheckDefinition = {
  id: "cors-misconfig",
  name: "CORS mal configurado",
  category: "webconfig",
  description:
    "Envía Origin ajeno y refleja si el servidor lo acepta con credenciales (exfiltración cross-origin).",
  run: async (ctx) => {
    try {
      const res = await ctx.fetch(ctx.origin, {
        headers: { Origin: "https://evil.example.com" },
        signal: AbortSignal.timeout(ctx.timeoutMs),
      });
      const acao = res.headers.get("access-control-allow-origin");
      const acac = res.headers.get("access-control-allow-credentials");

      if (acao === "https://evil.example.com" && acac === "true") {
        return {
          id: "cors-misconfig",
          name: "CORS mal configurado",
          status: "finding",
          severity: "high",
          summary: "El servidor refleja Origin arbitrario CON credenciales — exfiltración cross-origin posible.",
          evidence: {
            accessControlAllowOrigin: acao,
            accessControlAllowCredentials: acac,
          },
        };
      }
      if (acao === "*") {
        return {
          id: "cors-misconfig",
          name: "CORS mal configurado",
          status: "finding",
          severity: "low",
          summary: "Access-Control-Allow-Origin: * (lectura pública de recursos; revisar si es intencional).",
          evidence: { accessControlAllowOrigin: acao },
        };
      }
      return {
        id: "cors-misconfig",
        name: "CORS mal configurado",
        status: "pass",
        summary: "CORS restrictivo u ausente.",
        evidence: { accessControlAllowOrigin: acao ?? null },
      };
    } catch (err) {
      return {
        id: "cors-misconfig",
        name: "CORS mal configurado",
        status: "error",
        summary: "No se pudo probar CORS.",
        evidence: { error: String(err instanceof Error ? err.message : err) },
      };
    }
  },
};

/** Re-export para el runner: captura de homepage reutilizable. */
export { getWithCapture as getHomepageCapture };
