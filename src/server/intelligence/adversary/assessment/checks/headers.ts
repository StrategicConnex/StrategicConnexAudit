/**
 * headers.ts — Checks reales de cabeceras de seguridad y cookies.
 *
 * Un GET al origen analiza la respuesta REAL: presencia/ausencia de CSP,
 * HSTS, XFO, XCTO, Referrer-Policy, Permissions-Policy, y flags de cookies
 * (Secure / HttpOnly / SameSite).
 */

import type { CheckContext, CheckDefinition } from "../types";

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

export const securityHeadersCheck: CheckDefinition = {
  id: "security-headers",
  name: "Cabeceras de seguridad HTTP",
  category: "headers",
  description:
    "GET real a / — mide qué cabeceras de seguridad (CSP, HSTS, XFO…) presenta la respuesta.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const res = await fetch(origin, { signal: AbortSignal.timeout(timeoutMs) });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const missing = SECURITY_HEADERS.filter((h) => !headers[h]);
    const present = SECURITY_HEADERS.filter((h) => !!headers[h]);

    if (missing.length === 0) {
      return {
        id: "security-headers",
        name: "Cabeceras de seguridad HTTP",
        status: "pass",
        summary: `Las 6 cabeceras de seguridad esenciales están presentes.`,
        evidence: { present, values: Object.fromEntries(present.map((h) => [h, headers[h]])) },
      };
    }

    // Ponderación: sin CSP o sin HSTS es grave; el resto medio/bajo.
    let severity: "low" | "medium" | "high" = missing.length >= 4 ? "high" : "medium";
    if (missing.includes("content-security-policy") || missing.includes("strict-transport-security")) {
      severity = "high";
    }

    return {
      id: "security-headers",
      name: "Cabeceras de seguridad HTTP",
      status: "finding",
      severity,
      summary: `${missing.length}/6 cabeceras de seguridad ausentes: ${missing.join(", ")}.`,
      evidence: {
        missing,
        present,
        allResponseHeaders: Object.fromEntries(
          Object.entries(headers).slice(0, 40)
        ),
      },
    };
  },
};

export const cookieFlagsCheck: CheckDefinition = {
  id: "cookie-flags",
  name: "Flags de cookies (Secure/HttpOnly/SameSite)",
  category: "headers",
  description:
    "Analiza las Set-Cookie reales de la respuesta principal buscando flags de protección ausentes.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const res = await fetch(origin, { signal: AbortSignal.timeout(timeoutMs) });
    const raw = res.headers.getSetCookie?.() ?? [];
    const setCookies = raw.length > 0 ? raw : [res.headers.get("set-cookie")].filter(Boolean) as string[];

    if (setCookies.length === 0) {
      return {
        id: "cookie-flags",
        name: "Flags de cookies",
        status: "pass",
        summary: "La respuesta principal no establece cookies.",
        evidence: { setCookieCount: 0 },
      };
    }

    const problems: Array<{ cookie: string; missing: string[] }> = [];
    for (const c of setCookies.slice(0, 20)) {
      const lower = c.toLowerCase();
      const name = c.split("=")[0]?.trim() ?? "?";
      const missing: string[] = [];
      if (!lower.includes("secure")) missing.push("Secure");
      if (!lower.includes("httponly")) missing.push("HttpOnly");
      if (!lower.includes("samesite")) missing.push("SameSite");
      if (missing.length > 0) problems.push({ cookie: name, missing });
    }

    if (problems.length === 0) {
      return {
        id: "cookie-flags",
        name: "Flags de cookies",
        status: "pass",
        summary: `${setCookies.length} cookies con flags correctos.`,
        evidence: { setCookieCount: setCookies.length },
      };
    }

    return {
      id: "cookie-flags",
      name: "Flags de cookies",
      status: "finding",
      severity: "medium",
      summary: `${problems.length}/${setCookies.length} cookies sin flags de protección.`,
      evidence: { problems, total: setCookies.length },
    };
  },
};
