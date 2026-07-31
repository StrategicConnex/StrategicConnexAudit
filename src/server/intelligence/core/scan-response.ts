/**
 * scan-response.ts — Shared response & metadata builder for intelligence scans.
 *
 * Extraido de POST /api/intelligence/route.ts para reutilizacion en
 * todas las rutas de inteligencia y facilitar testing aislado.
 *
 * Lecturas tipadas: cada `R.get()` se castea al contrato de salida del
 * executor (ver executor.types.ts) — NUNCA a `any`. Esto fija los nombres
 * de campos reales que produce cada executor (ej. dns.lookup → { a, aaaa,
 * mx, ns, txt, soa } en minuscula) y evita drift de keys mayusculas.
 */

import { Finding } from "../types/executor.types";
import type {
  DnsLookupOutput, DnsMxOutput, DnsTxtOutput, DnsNsOutput,
  ReverseDnsOutput, CdnOutput, WafOutput, ReverseIpOutput,
  IpReputationOutput, TracerouteOutput, TlsScanOutput,
} from "../types/executor.types";

export interface ExecutionToolResult {
  toolId: string;
  output: unknown;
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
  R: Map<string, unknown>;
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
  R: Map<string, unknown>;
  mailHealthScore: number;
  infraScore: number;
}

export function buildResultMap(results: ExecutionToolResult[]): Map<string, unknown> {
  return new Map(results.map((r) => [r.toolId, r.output]));
}

// ─── Accessors tipados por tool ──────────────────────────────────────────────

const asObj = <T>(value: unknown): T | undefined =>
  value && typeof value === "object" ? (value as T) : undefined;

const asArr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Acceso tipado a una tool: R.get(id) como objeto o undefined. */
const get = <T>(R: Map<string, unknown>, id: string): T | undefined =>
  asObj<T>(R.get(id));

export function getPrimaryIp(R: Map<string, unknown>): string | null {
  const dnsLookup = get<DnsLookupOutput>(R, "dns.lookup");
  const a = dnsLookup?.a ?? [];
  return a.length > 0 && typeof a[0] === "string" ? a[0] : null;
}

export function buildScanResponse(params: BuildResponseParams) {
  const { R, investigation, target, normalizedTarget, targetType, score, mailHealthScore, infraScore, aggregatedFindings } = params;

  const dnsLookup = get<DnsLookupOutput>(R, "dns.lookup");
  const dnsMx = get<DnsMxOutput>(R, "dns.mx");
  const dnsNs = get<DnsNsOutput>(R, "dns.ns");
  const dnsTxt = get<DnsTxtOutput>(R, "dns.txt");
  const tlsScan = get<TlsScanOutput>(R, "tls.scan");

  // Contratos de email / headers (parciales — solo los campos que leemos)
  const spf = get<{ record?: string; spfParsed?: unknown }>(R, "email.spf");
  const dmarc = get<{ record?: string; dmarcParsed?: unknown }>(R, "email.dmarc");
  const dkim = get<{ count?: number }>(R, "email.dkim");
  const secHeaders = get<{ securityHeaders?: { hsts?: boolean } }>(R, "website.security_headers");

  return {
    success: true,
    investigation: {
      id: investigation.id, title: investigation.title, target,
      normalizedTarget, targetType, score, status: "completed",
      summary: `Puntuacion de Seguridad de Infraestructura: ${score}/100. Correo: ${mailHealthScore}/100. Servidor: ${infraScore}/100.`,
      metadata: { mailHealthCompositeScore: mailHealthScore, infrastructureScore: infraScore },
    },
    dns: {
      A: dnsLookup?.a ?? [], AAAA: dnsLookup?.aaaa ?? [],
      MX: dnsMx?.records ?? [], NS: dnsNs?.servers ?? [],
      TXT: dnsTxt?.records ?? [],
    },
    ssl: (tlsScan ?? {}) as TlsScanOutput,
    email: {
      spf: spf?.record ?? null, spfParsed: spf?.spfParsed ?? null,
      dmarc: dmarc?.record ?? null, dmarcParsed: dmarc?.dmarcParsed ?? null,
      dkim: dkim ?? {}, bimi: { success: false, error: "No configurado" },
    },
    headers: R.get("website.headers") || {},
    redirect: { success: true, redirectsToHttps: !!secHeaders?.securityHeaders?.hsts },
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

  const spf = get<{ spfParsed?: unknown }>(R, "email.spf");
  const dmarc = get<{ dmarcParsed?: unknown }>(R, "email.dmarc");
  const dkim = get<{ count?: number }>(R, "email.dkim");
  const secHeaders = get<{ securityHeaders?: { hsts?: boolean } }>(R, "website.security_headers");
  const reverseDns = get<ReverseDnsOutput>(R, "network.reverse_dns");
  const cdn = get<CdnOutput>(R, "network.cdn");
  const waf = get<WafOutput>(R, "network.waf");
  const reverseIp = get<ReverseIpOutput>(R, "network.reverse_ip");
  const reputation = get<IpReputationOutput>(R, "threat.ip_reputation");
  const traceroute = get<TracerouteOutput>(R, "network.traceroute");

  return {
    mailHealthCompositeScore: mailHealthScore, infrastructureScore: infraScore,
    spfParsed: spf?.spfParsed ?? null,
    dmarcParsed: dmarc?.dmarcParsed ?? null,
    dkimCount: dkim?.count ?? 0, bimiSuccess: false,
    redirectsToHttps: !!secHeaders?.securityHeaders?.hsts,
    whois: R.get("osint.whois") || {},
    asnGeo: { ...(R.get("network.geoip") || {}), ...(R.get("network.asn") || {}) },
    reverseDns: asArr<string>(reverseDns?.ptr ?? []),
    ping: R.get("network.ping") || {},
    cdnWaf: {
      detected: !!(cdn?.detected || waf?.detected),
      cdnProvider: cdn?.provider ?? null,
      wafProvider: waf?.wafProvider ?? null,
      cdnMethod: cdn?.method ?? null,
      wafConfidence: waf?.confidence ?? 0,
    },
    reverseIp: asArr<string>(reverseIp?.domains ?? []),
    dnsbl: asArr(reputation?.blacklistsListed ?? []),
    reputation: reputation ?? {},
    traceroute: asArr(traceroute?.hops ?? []),
  };
}
