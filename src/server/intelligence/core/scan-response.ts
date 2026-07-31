/**
 * scan-response.ts — Shared response & metadata builder for intelligence scans.
 *
 * Extraido de POST /api/intelligence/route.ts para reutilizacion en
 * todas las rutas de inteligencia y facilitar testing aislado.
 */

import { Finding } from "../types/executor.types";

export interface ExecutionToolResult {
  toolId: string;
  output: any;
}

export interface ScanInvestigation {
  id: string;
  title: string;
  target: string;
  normalizedTarget: string;
  targetType: string;
  score: number | null;
  status: string;
}

export interface BuildResponseParams {
  R: Map<string, any>;
  investigation: ScanInvestigation;
  target: string;
  normalizedTarget: string;
  targetType: string;
  score: number;
  mailHealthScore: number;
  infraScore: number;
  aggregatedFindings: Finding[];
}

export interface BuildMetadataParams {
  R: Map<string, any>;
  mailHealthScore: number;
  infraScore: number;
}

export function buildResultMap(results: ExecutionToolResult[]): Map<string, any> {
  return new Map(results.map((r) => [r.toolId, r.output]));
}

export function getPrimaryIp(R: Map<string, any>): string | null {
  const dnsLookup = R.get("dns.lookup");
  if (!dnsLookup || typeof dnsLookup !== "object") return null;
  const A = Array.isArray((dnsLookup as { A?: unknown }).A) ? (dnsLookup as { A: unknown[] }).A : [];
  return A.length > 0 && typeof A[0] === "string" ? A[0] : null;
}

export function buildScanResponse(params: BuildResponseParams) {
  const { R, investigation, target, normalizedTarget, targetType, score, mailHealthScore, infraScore, aggregatedFindings } = params;
  return {
    success: true,
    investigation: {
      id: investigation.id, title: investigation.title, target,
      normalizedTarget, targetType, score, status: "completed",
      summary: `Puntuacion de Seguridad de Infraestructura: ${score}/100. Correo: ${mailHealthScore}/100. Servidor: ${infraScore}/100.`,
      metadata: { mailHealthCompositeScore: mailHealthScore, infrastructureScore: infraScore },
    },
    dns: {
      A: R.get("dns.lookup")?.A || [], AAAA: R.get("dns.lookup")?.AAAA || [],
      MX: R.get("dns.mx")?.MX || [], NS: R.get("dns.ns")?.NS || [],
      TXT: R.get("dns.txt")?.TXT || [],
    },
    ssl: R.get("tls.scan") || {},
    email: {
      spf: R.get("email.spf")?.record || null, spfParsed: R.get("email.spf")?.spfParsed || null,
      dmarc: R.get("email.dmarc")?.record || null, dmarcParsed: R.get("email.dmarc")?.dmarcParsed || null,
      dkim: R.get("email.dkim") || {}, bimi: { success: false, error: "No configurado" },
    },
    headers: R.get("website.headers") || {},
    redirect: { success: true, redirectsToHttps: !!(R.get("website.security_headers")?.securityHeaders?.hsts) },
    findings: aggregatedFindings,
    dnssec: R.get("dns.dnssec") || {}, propagation: R.get("dns.propagation") || {},
    zone: R.get("dns.zone") || {}, redirects: R.get("website.redirects") || {},
    cookies: R.get("website.cookies") || {}, csp: R.get("website.csp") || {},
    asn: R.get("network.asn") || {}, cdn: R.get("network.cdn") || {},
    waf: R.get("network.waf") || {}, reverseIp: R.get("network.reverse_ip") || {},
    reputation: R.get("threat.ip_reputation") || {},
  };
}

export function buildScanMetadata(params: BuildMetadataParams) {
  const { R, mailHealthScore, infraScore } = params;
  return {
    mailHealthCompositeScore: mailHealthScore, infrastructureScore: infraScore,
    spfParsed: R.get("email.spf")?.spfParsed || null,
    dmarcParsed: R.get("email.dmarc")?.dmarcParsed || null,
    dkimCount: R.get("email.dkim")?.count || 0, bimiSuccess: false,
    redirectsToHttps: !!(R.get("website.security_headers")?.securityHeaders?.hsts),
    whois: R.get("osint.whois") || {},
    asnGeo: { ...(R.get("network.geoip") || {}), ...(R.get("network.asn") || {}) },
    reverseDns: R.get("network.reverse_dns")?.ptr || [],
    ping: R.get("network.ping") || {},
    cdnWaf: {
      detected: !!(R.get("network.cdn")?.detected || R.get("network.waf")?.detected),
      cdnProvider: R.get("network.cdn")?.provider || null,
      wafProvider: R.get("network.waf")?.wafProvider || null,
      cdnMethod: R.get("network.cdn")?.method || null,
      wafConfidence: R.get("network.waf")?.confidence || 0,
    },
    reverseIp: R.get("network.reverse_ip")?.domains || [],
    dnsbl: R.get("threat.ip_reputation")?.blacklistsListed || [],
    reputation: R.get("threat.ip_reputation") || {},
    traceroute: R.get("network.traceroute")?.hops || [],
  };
}
