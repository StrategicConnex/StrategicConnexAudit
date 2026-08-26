/**
 * mitre-checks.ts — Checks reales específicos de técnicas MITRE.
 *
 * Complementan ASSESSMENT_CATALOG con pruebas externas no destructivas
 * para técnicas que los checks genéricos no cubren:
 *   · email-spoofing        → T1566 (Spearphishing): SPF/DKIM/DMARC reales vía DNS
 *   · default-admin-panels  → T1078.001: paneles admin expuestos SIN enviar credenciales
 *   · cloud-storage-public  → T1530: buckets cloud referenciados con listado público
 */

import dns from "node:dns/promises";
import type { CheckContext, CheckDefinition, CheckResult } from "../types";

// ─── T1566 — Phishing: protección real contra suplantación de email ────────

export const emailSpoofingCheck: CheckDefinition = {
  id: "email-spoofing",
  name: "Suplantación de email (SPF/DKIM/DMARC)",
  category: "content",
  description:
    "Resolución DNS real de SPF, DKIM y DMARC del dominio: sin DMARC restrictivo, terceros pueden suplantar al dominio en phishing.",
  run: async ({ host }: CheckContext): Promise<CheckResult> => {
    const findings: string[] = [];
    const evidence: Record<string, unknown> = { domain: host };

    // TXT del dominio → SPF + DMARC externo
    let txt: string[][] = [];
    try {
      txt = await dns.resolveTxt(host);
    } catch {
      evidence.dnsError = `sin registros TXT resolubles para ${host}`;
    }
    const flat = txt.map((r) => r.join(""));
    const spf = flat.find((r) => r.toLowerCase().startsWith("v=spf1"));
    evidence.spfRecord = spf ?? null;

    if (!spf) {
      findings.push("Sin registro SPF: cualquier servidor puede enviar emails que se presentan como este dominio");
    } else if (/\+all|~all|\?all/i.test(spf) || /-all/i.test(spf) === false) {
      findings.push("SPF presente pero sin hard fail (-all): la suplantación sigue siendo viable");
    }

    // DMARC
    let dmarcTxt: string[][] = [];
    try {
      dmarcTxt = await dns.resolveTxt(`_dmarc.${host}`);
    } catch {
      /* sin DMARC */
    }
    const dmarc = dmarcTxt.map((r) => r.join("")).find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    evidence.dmarcRecord = dmarc ?? null;

    if (!dmarc) {
      findings.push("Sin registro DMARC: los receptores no tienen política ante emails suplantados");
    } else if (!/p=(reject|quarantine)/i.test(dmarc)) {
      findings.push("DMARC sin enforcement (p=none): la suplantación llega a bandeja de entrada");
    }

    // DKIM selector común (default, google, selector1/2)
    const dkimSelectors = ["default", "google", "selector1", "selector2", "k1", "s1"];
    let dkimFound: string | null = null;
    for (const sel of dkimSelectors) {
      try {
        const r = await dns.resolveTxt(`${sel}._domainkey.${host}`);
        const joined = r.map((x) => x.join("")).join("");
        if (joined.includes("v=DKIM1") || joined.includes("p=")) {
          dkimFound = `${sel}._domainkey`;
          break;
        }
      } catch {
        /* siguiente selector */
      }
    }
    evidence.dkimSelector = dkimFound;

    if (!dkimFound) {
      findings.push("Sin DKIM detectable en selectores comunes: menor autenticidad criptográfica");
    }

    if (findings.length === 0) {
      return {
        id: "email-spoofing",
        name: "Suplantación de email",
        status: "pass",
        summary: "SPF con hard-fail, DKIM y DMARC con enforcement correctos.",
        evidence,
      };
    }

    return {
      id: "email-spoofing",
      name: "Suplantación de email",
      status: "finding",
      severity: findings.some((f) => f.startsWith("Sin registro SPF") || f.startsWith("Sin registro DMARC"))
        ? "high"
        : "medium",
      summary: `${findings.length} debilidad(es) de autenticación de email: ${findings[0]}`,
      evidence: { ...evidence, allFindings: findings },
    };
  },
};

// ─── T1078.001 — Paneles de administración expuestos (SIN credenciales) ────

const ADMIN_PATHS = [
  "/admin",
  "/administrator",
  "/wp-login.php",
  "/wp-admin/",
  "/login",
  "/manager/html",
  "/phpmyadmin/",
  "/jenkins/",
  "/grafana/",
  "/kibana/",
];

export const defaultAdminPanelsCheck: CheckDefinition = {
  id: "default-admin-panels",
  name: "Paneles de administración expuestos",
  category: "exposure",
  description:
    "GET-only a rutas de paneles comunes: detecta interfaces administrativas alcanzables desde internet. NO envía credenciales.",
  run: async ({ origin, fetch, timeoutMs }) => {
    const exposed: Array<{ path: string; status: number; hint: string }> = [];

    // Referencia anti-falso-positivo: un SPA puede devolver su index.html para
    // cualquier ruta — solo contamos respuestas DISTINTAS de la homepage.
    let homeBody = "";
    try {
      const homeRes = await fetch(origin, { signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)) });
      homeBody = await homeRes.text();
    } catch {
      /* sin referencia */
    }

    for (const path of ADMIN_PATHS) {
      try {
        const res = await fetch(`${origin}${path}`, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        // 200 con formulario de login = panel alcanzable; 401/403 = protegido
        // (existente pero con control de acceso); 404/redirect a home = no expuesto.
        if (res.status !== 200) continue;
        const body = await res.text();
        const isLoginForm =
          /type=["']?password|name=["']?(user|passwd|password|log|pwd)/i.test(body);
        const differsFromHome =
          !homeBody || Math.abs(body.length - homeBody.length) > 200 || body.slice(0, 500) !== homeBody.slice(0, 500);
        if (isLoginForm && differsFromHome) {
          exposed.push({
            path,
            status: res.status,
            hint:
              path === "/manager/html" ? "Tomcat Manager" :
              path === "/phpmyadmin/" ? "phpMyAdmin" :
              path === "/jenkins/" ? "Jenkins" :
              path === "/grafana/" ? "Grafana" :
              path === "/kibana/" ? "Kibana" :
              path.includes("wp-") ? "WordPress" : "Panel genérico",
          });
        }
      } catch {
        /* siguiente */
      }
    }

    if (exposed.length === 0) {
      return {
        id: "default-admin-panels",
        name: "Paneles de administración expuestos",
        status: "pass",
        summary: `Ninguno de ${ADMIN_PATHS.length} paneles comunes es accesible públicamente.`,
        evidence: { checked: ADMIN_PATHS },
      };
    }

    const highRisk = exposed.some((e) =>
      ["Tomcat Manager", "phpMyAdmin", "Jenkins"].includes(e.hint)
    );

    return {
      id: "default-admin-panels",
      name: "Paneles de administración expuestos",
      status: "finding",
      severity: highRisk ? "high" : "medium",
      summary: `${exposed.length} panel(es) administrativo(s) accesibles desde internet.`,
      evidence: { exposed },
    };
  },
};

// ─── T1530 — Buckets cloud públicos referenciados por el sitio ─────────────

export const cloudStoragePublicCheck: CheckDefinition = {
  id: "cloud-storage-public",
  name: "Cloud storage público listable",
  category: "content",
  description:
    "Extrae URLs de buckets (S3/Blob/GCS) referenciadas en el HTML y comprueba si permiten listado público.",
  run: async ({ origin, fetch, timeoutMs, host }) => {
    // 1. Obtener homepage para extraer URLs de buckets
    let html = "";
    try {
      const res = await fetch(origin, { signal: AbortSignal.timeout(timeoutMs) });
      html = await res.text();
    } catch {
      return {
        id: "cloud-storage-public",
        name: "Cloud storage público",
        status: "error",
        summary: "No se pudo obtener la página principal para extraer buckets.",
        evidence: {},
      };
    }

    const bucketUrls = [
      ...new Set(
        [
          ...html.matchAll(/https:\/\/([a-z0-9][a-z0-9.-]{2,60})\.s3[.-]([a-z0-9-]*)\.amazonaws\.com[^"'\s)>]*?/gi),
          ...html.matchAll(/https:\/\/([a-z0-9-]+)\.blob\.core\.windows\.net\/([a-z0-9-]+)[^"'\s)>]*?/gi),
          ...html.matchAll(/https:\/\/storage\.googleapis\.com\/([a-z0-9-_]+)[^"'\s)>]*?/gi),
        ].map((m) => m[0].replace(/[.,)]+$/, ""))
      ),
    ].slice(0, 5);

    if (bucketUrls.length === 0) {
      return {
        id: "cloud-storage-public",
        name: "Cloud storage público",
        status: "pass",
        summary: `Sin buckets cloud referenciados en el HTML de ${host}.`,
        evidence: {},
      };
    }

    const listable: Array<{ bucketUrl: string; evidenceSnippet: string }> = [];
    for (const url of bucketUrls) {
      try {
        const res = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(Math.min(timeoutMs, 6_000)),
        });
        if (res.status !== 200) continue;
        const body = await res.text().catch(() => "");
        // ListBucketResponse (S3), List Blobs (Azure XML), GCS ListBucketResult
        if (/ListBucketResult|<Blobs>|KeyCount/i.test(body)) {
          listable.push({ bucketUrl: url, evidenceSnippet: body.slice(0, 200) });
        }
      } catch {
        /* siguiente */
      }
    }

    if (listable.length === 0) {
      return {
        id: "cloud-storage-public",
        name: "Cloud storage público",
        status: "pass",
        summary: `${bucketUrls.length} bucket(s) referenciado(s); ninguno permite listado público.`,
        evidence: { referenced: bucketUrls },
      };
    }

    return {
      id: "cloud-storage-public",
      name: "Cloud storage público",
      status: "finding",
      severity: "high",
      summary: `${listable.length}/${bucketUrls.length} bucket(s) permiten LISTADO PÚBLICO de objetos.`,
      evidence: { referenced: bucketUrls, listable },
    };
  },
};
