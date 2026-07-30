/**
 * subdomain-takeover.ts — Subdomain Takeover Detection Executor
 *
 * toolId: network.subdomain_takeover
 * Detecta subdominios que apuntan a servicios cloud desactivados,
 * vulnerables a secuestro (takeover).
 *
 * Servicios chequeados: AWS CloudFront, S3, GitHub Pages, Heroku,
 * Azure, Shopify, Surge, Netlify, Pantheon, Fly.io, Vercel.
 */

import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding } from "../types/executor.types";

const hostSchema = z.object({ host: z.string().min(3).max(253) });

// Known vulnerable fingerprints: CNAME target → service name
const TAKEOVER_SIGNATURES: Array<{ pattern: RegExp; service: string; description: string }> = [
  { pattern: /cloudfront\.net$/i, service: "AWS CloudFront", description: "CloudFront distribution desactivada o eliminada" },
  { pattern: /s3\.amazonaws\.com$/i, service: "AWS S3 Bucket", description: "Bucket S3 eliminado o acceso denegado" },
  { pattern: /s3-website[-\..]*\.amazonaws\.com$/i, service: "AWS S3 Website", description: "Website S3 eliminado" },
  { pattern: /github\.io$/i, service: "GitHub Pages", description: "Repositorio GitHub Pages desactivado" },
  { pattern: /herokuapp\.com$/i, service: "Heroku", description: "Aplicación Heroku eliminada" },
  { pattern: /herokuspace\.com$/i, service: "Heroku", description: "Aplicación Heroku eliminada (espacio)" },
  { pattern: /azurewebsites\.net$/i, service: "Azure App Service", description: "App Service de Azure eliminado" },
  { pattern: /azureedge\.net$/i, service: "Azure CDN", description: "Endpoint Azure CDN eliminado" },
  { pattern: /trafficmanager\.net$/i, service: "Azure Traffic Manager", description: "Perfil Traffic Manager eliminado" },
  { pattern: /myshopify\.com$/i, service: "Shopify", description: "Tienda Shopify eliminada o dominio no configurado" },
  { pattern: /surge\.sh$/i, service: "Surge.sh", description: "Proyecto Surge.sh despublicado" },
  { pattern: /netlify\.app$/i, service: "Netlify", description: "Site Netlify eliminado" },
  { pattern: /netlify\.com$/i, service: "Netlify", description: "Site Netlify eliminado" },
  { pattern: /pantheonsite\.io$/i, service: "Pantheon", description: "Site Pantheon eliminado" },
  { pattern: /fly\.dev$/i, service: "Fly.io", description: "App Fly.io eliminada" },
  { pattern: /firebaseapp\.com$/i, service: "Firebase", description: "Firebase Hosting desactivado" },
  { pattern: /vercel\.app$/i, service: "Vercel", description: "Proyecto Vercel eliminado" },
  { pattern: /pages\.dev$/i, service: "Cloudflare Pages", description: "Cloudflare Pages eliminado" },
  { pattern: /zendesk\.com$/i, service: "Zendesk", description: "Zendesk desactivado" },
  { pattern: /fastly\.net$/i, service: "Fastly", description: "Fastly service eliminado" },
  // Generic HTTP fingerprints
  { pattern: /unbouncepages\.com$/i, service: "Unbounce", description: "Landing page Unbounce eliminada" },
  { pattern: /helpjuice\.com$/i, service: "Helpjuice", description: "Helpjuice knowledge base eliminada" },
  { pattern: /freshdesk\.com$/i, service: "Freshdesk", description: "Freshdesk portal eliminado" },
];

// HTTP response fingerprints for services that don't use DNS CNAME
const HTTP_FINGERPRINTS: Array<{ pattern: RegExp; service: string; description: string }> = [
  { pattern: /NoSuchBucket/i, service: "AWS S3", description: "Bucket S3 no existe" },
  { pattern: /The specified bucket does not exist/i, service: "AWS S3", description: "Bucket S3 no existe" },
  { pattern: /There is no app configured at that hostname/i, service: "Heroku", description: "App Heroku no configurada" },
  { pattern: /Bad Request.*No such host/i, service: "Azure", description: "Host no configurado en Azure" },
  { pattern: /404 Not Found.*a GitHub Pages site/i, service: "GitHub Pages", description: "GitHub Pages no encontrado" },
  { pattern: /Sorry, this shop is currently unavailable/i, service: "Shopify", description: "Tienda Shopify inaccesible" },
  { pattern: /The site you are looking for does not exist/i, service: "Netlify", description: "Netlify site no existe" },
  { pattern: /is not a registered InCloud WeTrust/i, service: "Pantheon", description: "Pantheon site no existe" },
  { pattern: /This site is not configured/i, service: "Fly.io", description: "Fly.io app no configurada" },
  { pattern: /Application not found/i, service: "Vercel", description: "Vercel deployment no encontrado" },
  { pattern: /There is nothing here yet/i, service: "Cloudflare Pages", description: "Cloudflare Pages vacío" },
  { pattern: /does not exist\. Check for mispell/i, service: "Zendesk", description: "Zendesk no existe" },
];

export const subdomainTakeoverExecutor: ToolExecutor<{ host: string }, any> = {
  id: "network.subdomain_takeover",
  timeoutMs: 20000,
  category: "network",
  validate(input: unknown) { return hostSchema.parse(input); },
  async execute(ctx: ExecutionContext, { host }): Promise<ExecutionResult<any>> {
    ctx.log(`[Subdomain Takeover] Analizando: ${host}`);
    await assertPublicHostname(host);

    const findings: Finding[] = [];
    const cnames: string[] = [];
    let vulnerable = false;
    let takeoverService: string | null = null;

    // 1. Resolve CNAME records
    try {
      const records = await dns.resolve(host, "CNAME");
      cnames.push(...records);
    } catch {
      // No CNAME
    }

    // 2. Check CNAME against known vulnerable services
    for (const cname of cnames) {
      for (const sig of TAKEOVER_SIGNATURES) {
        if (sig.pattern.test(cname)) {
          vulnerable = true;
          takeoverService = sig.service;
          ctx.log(`[Subdomain Takeover] CNAME vulnerable: ${host} → ${cname} (${sig.service})`);
          findings.push({
            severity: "high", confidence: 0.9,
            title: `Subdominio Vulnerable a Takeover (${sig.service})`,
            description: `El subdominio ${host} apunta a ${cname}, un servicio ${sig.description}. Un atacante podría reclamar este recurso y alojar contenido malicioso bajo su dominio.`,
            recommendation: `Elimine el registro CNAME para ${host} o reconfigure el servicio ${sig.service} para que responda correctamente.`,
            affectedAsset: host,
            evidence: { cname, service: sig.service, signature: sig.pattern.source, detectedBy: "CNAME" },
          });
        }
      }
    }

    // 3. HTTP fingerprint check (if no CNAME match, probe directly)
    if (!vulnerable) {
      try {
        const res = await safeFetch(`https://${host}`, { method: "GET" });
        const body = await res.text().catch(() => "");

        // Check a subset of response body
        const sample = body.substring(0, 2000);
        for (const fp of HTTP_FINGERPRINTS) {
          if (fp.pattern.test(sample)) {
            vulnerable = true;
            takeoverService = fp.service;
            ctx.log(`[Subdomain Takeover] HTTP fingerprint: ${host} → ${fp.service}`);
            findings.push({
              severity: "high", confidence: 0.85,
              title: `Subdominio Vulnerable a Takeover (${fp.service})`,
              description: `El subdominio ${host} responde con el error característico de ${fp.description}. Un atacante podría reclamar este recurso.`,
              recommendation: `Elimine la configuración DNS de ${host} o reconfigure el servicio ${fp.service}.`,
              affectedAsset: host,
              evidence: { service: fp.service, detectedBy: "HTTP", fingerprint: fp.pattern.source },
            });
            break;
          }
        }
      } catch {
        // Connection refused or timeout — not vulnerable
      }
    }

    // 4. Safe finding if no takeover detected
    if (!vulnerable) {
      findings.push({
        severity: "info", confidence: 0.8,
        title: "Subdominio No Vulnerable a Takeover",
        description: `No se detectaron signos de takeover para ${host}. Los registros DNS y respuestas HTTP son normales.`,
        recommendation: "Monitoree peri\u00f3dicamente con esta herramienta para detectar cambios.",
        affectedAsset: host,
        evidence: { cnames, vulnerable: false },
      });
    }

    const output = {
      host,
      cnames,
      vulnerable,
      takeoverService,
      signaturesChecked: TAKEOVER_SIGNATURES.length,
      httpFingerprintsChecked: HTTP_FINGERPRINTS.length,
    };

    ctx.log(`[Subdomain Takeover] Completado: ${host} — ${vulnerable ? `VULNERABLE (${takeoverService})` : "No vulnerable"}`);
    return { success: true, output, findings };
  },
};
