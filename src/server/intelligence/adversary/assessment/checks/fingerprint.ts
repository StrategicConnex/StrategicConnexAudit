/**
 * fingerprint.ts — Fingerprinting tecnológico + contenido inseguro.
 *
 * Detecta server/x-powered-by/generator, contrasta versiones contra una
 * tabla estática de CVEs conocidas (embebida, sin API externa) y analiza
 * el HTML de la homepage buscando mixed content y scripts CDN sin SRI.
 */

import type { CheckContext, CheckDefinition } from "../types";
import { getWithCapture } from "./exposure";

/** Tabla estática mínima: producto → versión máxima vulnerable. */
const KNOWN_CVE_FINGERPRINTS: Array<{
  product: string;
  header: "server" | "x-powered-by" | "generator";
  versionRegex: RegExp;
  maxVulnerable: string;
  cve: string;
  severity: "high" | "medium" | "critical";
  summary: string;
}> = [
  {
    product: "Apache", header: "server", versionRegex: /Apache\/([\d.]+)/i,
    maxVulnerable: "2.4.49", cve: "CVE-2021-41773 (path traversal/RCE)",
    severity: "critical",
    summary: "Versión de Apache con path traversal y RCE conocidos (2.4.49/2.4.50).",
  },
  {
    product: "nginx", header: "server", versionRegex: /nginx\/([\d.]+)/i,
    maxVulnerable: "1.20.0", cve: "CVE-2021-23017 (DNS resolver RCE)",
    severity: "high",
    summary: "Versión de nginx anterior a 1.21.0 con vulnerabilidades conocidas.",
  },
  {
    product: "PHP", header: "x-powered-by", versionRegex: /PHP\/([\d.]+)/i,
    maxVulnerable: "7.4.99", cve: "múltiples (EOL desde nov-2022)",
    severity: "high",
    summary: "PHP 7.x o anterior — fin de soporte, sin parches de seguridad.",
  },
  {
    product: "WordPress", header: "generator", versionRegex: /WordPress\s+([\d.]+)/i,
    maxVulnerable: "6.3.99", cve: "varias XSS/SSRF en < 6.4",
    severity: "medium",
    summary: "WordPress < 6.4 — actualizar por vulnerabilidades públicas.",
  },
];

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export const techFingerprintCheck: CheckDefinition = {
  id: "tech-fingerprint",
  name: "Fingerprinting tecnológico + CVEs conocidas",
  category: "content",
  description:
    "Detecta tecnologías y versiones reales en headers/meta y las contrasta contra una tabla de CVEs embebida.",
  run: async (ctx) => {
    const capture = await getWithCapture(ctx, "/");
    if (!capture || capture.status >= 500) {
      return {
        id: "tech-fingerprint",
        name: "Fingerprinting tecnológico",
        status: "error",
        summary: "No se pudo obtener la página principal.",
        evidence: { status: capture?.status ?? null },
      };
    }

    const detected: Array<{ product: string; version: string; source: string }> = [];
    for (const fp of KNOWN_CVE_FINGERPRINTS) {
      const raw =
        fp.header === "generator"
          ? capture.body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1]
          : capture.headers[fp.header];
      if (!raw) continue;
      const v = raw.match(fp.versionRegex)?.[1];
      if (v) detected.push({ product: fp.product, version: v, source: fp.header });
    }

    const vulnerable = KNOWN_CVE_FINGERPRINTS.flatMap((fp) => {
      const d = detected.find((x) => x.product === fp.product);
      if (!d) return [];
      // maxVulnerable "7.4.99": cualquier versión <= ese umbral es vulnerable
      return compareVersions(d.version, fp.maxVulnerable) <= 0
        ? [{
            product: fp.product,
            version: d.version,
            cve: fp.cve,
            severity: fp.severity,
            summary: fp.summary,
          }]
        : [];
    });

    return {
      id: "tech-fingerprint",
      name: "Fingerprinting tecnológico + CVEs conocidas",
      status: vulnerable.length > 0 ? "finding" : "pass",
      severity: vulnerable.some((v) => v.severity === "critical")
        ? "critical"
        : vulnerable[0]?.severity ?? undefined,
      summary:
        vulnerable.length > 0
          ? `${vulnerable.length} tecnología(s) con versión vulnerable expuesta públicamente.`
          : `Tecnologías detectadas sin versiones vulnerables conocidas${detected.length > 0 ? ": " + detected.map((d) => `${d.product} ${d.version}`).join(", ") : ""}.`,
      evidence: { detected, vulnerable },
    };
  },
};

export const insecureContentCheck: CheckDefinition = {
  id: "insecure-content",
  name: "Contenido mixto y scripts CDN sin SRI",
  category: "content",
  description:
    "Analiza el HTML real de la homepage: recursos http:// en página https y <script src> externos sin integrity.",
  run: async (ctx) => {
    const capture = await getWithCapture(ctx, "/");
    if (!capture || !capture.body.includes("<")) {
      return {
        id: "insecure-content",
        name: "Contenido mixto y SRI",
        status: "error",
        summary: "HTML principal no disponible para análisis.",
        evidence: {},
      };
    }

    const body = capture.body;
    const mixedContent = [
      ...body.matchAll(/(?:src|href)=["'](http:\/\/[^"']+)["']/gi),
    ].map((m) => m[1]!).slice(0, 10);

    const externalScripts = [...body.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi)];
    const scriptsWithoutSri = externalScripts
      .filter((m) => !m[0].includes("integrity="))
      .map((m) => m[1]!)
      .filter((src) => !src.includes(new URL(ctx.origin).host))
      .slice(0, 10);

    const findings: string[] = [];
    let severity: "low" | "medium" | undefined;

    if (mixedContent.length > 0) {
      findings.push(`${mixedContent.length} recurso(s) cargados por HTTP inseguro (mixed content)`);
      severity = "medium";
    }
    if (scriptsWithoutSri.length > 0) {
      findings.push(`${scriptsWithoutSri.length} script(s) externo(s) sin Subresource Integrity`);
      severity = severity ?? "low";
    }

    if (findings.length === 0) {
      return {
        id: "insecure-content",
        name: "Contenido mixto y SRI",
        status: "pass",
        summary: "Sin contenido mixto ni scripts externos sin SRI en la homepage.",
        evidence: {},
      };
    }

    return {
      id: "insecure-content",
      name: "Contenido mixto y SRI",
      status: "finding",
      severity,
      summary: findings.join("; ") + ".",
      evidence: { mixedContent, scriptsWithoutSri },
    };
  },
};

export const emailExposureCheck: CheckDefinition = {
  id: "email-exposure",
  name: "Emails expuestos en HTML",
  category: "content",
  description:
    "Extrae direcciones email visibles en la homepage — superficie para spearphishing (T1566).",
  run: async (ctx) => {
    const capture = await getWithCapture(ctx, "/");
    if (!capture) {
      return {
        id: "email-exposure",
        name: "Emails expuestos",
        status: "error",
        summary: "HTML principal no disponible.",
        evidence: {},
      };
    }
    const emails = [
      ...new Set(
        [...capture.body.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)]
          .map((m) => m[0])
          .filter((e) => !/(example|sentry|wixpress|\.png|\.jpg|\.webp)/i.test(e))
      ),
    ].slice(0, 15);

    if (emails.length === 0) {
      return {
        id: "email-exposure",
        name: "Emails expuestos",
        status: "pass",
        summary: "Sin emails visibles en la homepage.",
        evidence: {},
      };
    }
    return {
      id: "email-exposure",
      name: "Emails expuestos",
      status: "finding",
      severity: "info",
      summary: `${emails.length} dirección(es) email públicamente visibles — superficie de spearphishing.`,
      evidence: { emails },
    };
  },
};
