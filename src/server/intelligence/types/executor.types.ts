import { ToolCategory } from "../registry/tool-registry";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Hallazgo normalizado generado por cualquier ejecutor de inteligencia.
 * Compatible con el esquema de persistencia Drizzle y el risk-engine.
 */
export interface Finding {
  /** ID del ejecutor que generó este hallazgo */
  toolId?: string;
  /** Categoría de la herramienta */
  category?: ToolCategory | string;
  /** Nivel de severidad determinístico */
  severity: Severity;
  /**
   * Nivel de confianza en el hallazgo (0.0 a 1.0).
   * Puede ser number o string coercible a number para compatibilidad
   * con valores serializados desde la base de datos.
   */
  confidence: number | string;
  /** Título conciso del hallazgo */
  title: string;
  /** Descripción técnica detallada */
  description: string;
  /** Recomendación de remediación (opcional) */
  recommendation?: string;
  /** Alias de recommendation para compatibilidad con tests y API */
  remediation?: string;
  /** Activo afectado (dominio, URL, IP) */
  affectedAsset?: string;
  /** Evidencia técnica estructurada */
  evidence?: Record<string, any>;
  /** Impacto numérico en el score de riesgo */
  scoreImpact?: number;
}

export interface ExecutionContext {
  projectId: string;
  investigationId?: string;
  userId?: string;
  signal?: AbortSignal;
  log: (message: string, payload?: Record<string, any>) => void;
}

// ─── Tipos de salida por herramienta (contrato tipado) ───────────────────────
// Cada ejecutor declara ToolExecutor<TInput, TOutput> con el TOutput concreto
// para que el ToolOutputMap derivado en tool-registry.ts sea preciso y
// scan-response.ts pueda leer resultados sin `any`.

/** Registro MX crudo de node:dns */
export interface MxRecord {
  priority: number;
  exchange: string;
}

/** Salida de dns.lookup — claves en minúscula (contrato con scan-response) */
export interface DnsLookupOutput {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: MxRecord[];
  ns: string[];
  txt: string[];
  soa: {
    nsname: string;
    hostmaster: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minttl: number;
  } | null;
}

/** Salida de dns.mx */
export interface DnsMxOutput {
  domain: string;
  records: MxRecord[];
}

/** Salida de dns.txt */
export interface DnsTxtOutput {
  domain: string;
  records: string[];
}

/** Salida de dns.ns */
export interface DnsNsOutput {
  domain: string;
  servers: string[];
}

/** Salida de tls.scan */
export interface TlsScanOutput {
  host: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  protocol: string | undefined;
  cipher: string;
}

/** Salida de network.ping */
export interface PingOutput {
  success: boolean;
  host: string;
  latencyMs: number | null;
  port: number;
  durationMs: number | null;
  reachable: boolean;
  method: string;
}

/** Salida de network.reverse_dns */
export interface ReverseDnsOutput {
  ip: string;
  hostnames: string[];
  ptr: string[];
}

/** Salida de network.geoip */
export interface GeoIpOutput {
  success: boolean;
  ip: string;
  ipAddress: string;
  ipv4: string | null;
  ipv6: string | null;
  ipVersion: number;
  country: string;
  countryName: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  cityName: string;
  asn: string;
  isp: string;
  asName: string;
  vpn: boolean;
  latitude: number;
  longitude: number;
}

/** Hop individual de network.traceroute */
export interface TracerouteHop {
  hop: number;
  ip: string;
  hostname: string;
  type: string;
  countryCode: string;
  cityName: string;
  latencyMs: number;
  asnOrg: string;
  asn: string;
}

/** Salida de network.traceroute */
export interface TracerouteOutput {
  destination: string;
  ip: string;
  hops: TracerouteHop[];
}

/** Salida de network.asn */
export interface AsnOutput {
  success: boolean;
  ip: string;
  ipAddress: string;
  asn: string;
  asnOrg: string;
  asName: string;
  country: string;
  countryName: string;
  range: string;
}

/** Salida de network.cdn */
export interface CdnOutput {
  domain: string;
  detected: boolean;
  provider: string;
  method: string;
}

/** Salida de network.waf */
export interface WafOutput {
  url: string;
  detected: boolean;
  wafProvider: string;
  confidence: number;
  signatures: string[];
}

/** Salida de network.reverse_ip */
export interface ReverseIpOutput {
  ip: string;
  coHostedCount: number;
  domains: string[];
}

/** Salida de threat.ip_reputation */
export interface IpReputationOutput {
  ip: string;
  reputationScore: number;
  isListed: boolean;
  blacklistsListed: string[];
}

// ─── Salidas de website.* ──────────────────────────────────────────────────

/** Salida de website.headers */
export interface WebsiteHeadersOutput {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/** Salida de website.security_headers */
export interface WebsiteSecurityHeadersOutput {
  url: string;
  hsts: string | null;
  csp: string | null;
  xfo: string | null;
  xcto: string | null;
  rp: string | null;
}

/** Salida de website.robots */
export interface WebsiteRobotsOutput {
  url: string;
  hasRobots: boolean;
  content: string;
}

/** Hop individual de website.redirects */
export interface RedirectHop {
  url: string;
  status: number;
  location: string | null;
}

/** Salida de website.redirects */
export interface WebsiteRedirectsOutput {
  url: string;
  chain: RedirectHop[];
  redirectCount: number;
  finalStatus: number;
  hasHttpsUpgrade: boolean;
  hasChainLoops: boolean;
}

/** Cookie analizada por website.cookies */
export interface CookieInfo {
  name: string;
  hasSecure: boolean;
  hasHttpOnly: boolean;
  hasSameSite: boolean;
  sameSiteValue: string;
  hasExpiry: boolean;
}

/** Salida de website.cookies */
export interface WebsiteCookiesOutput {
  url: string;
  cookies: CookieInfo[];
  cookieCount: number;
}

/** Salida de website.csp */
export interface WebsiteCspOutput {
  url: string;
  csp: string | null;
  directives: Record<string, string[]>;
  score: number;
  hasUnsafeInline: boolean;
  hasUnsafeEval: boolean;
  hasWildcardSrc: boolean;
  hasStrictDynamic: boolean;
  directiveCount: number;
}

// ─── Salidas de email.* ────────────────────────────────────────────────────

/** Salida de email.spf */
export interface EmailSpfOutput {
  domain: string;
  hasSpf: boolean;
  raw: string | null;
  policy: string;
  lookups: number;
  nestedIncludes: string[];
}

/** Salida de email.dmarc */
export interface EmailDmarcOutput {
  domain: string;
  hasDmarc: boolean;
  raw: string | null;
  policy: string;
  rua: string | null;
  pct: number;
}

/** Salida de email.dkim */
export interface EmailDkimOutput {
  domain: string;
  selector: string;
  hasDkim: boolean;
  raw: string | null;
}

// ─── Salidas de whois.full / osint.whois ───────────────────────────────────

/** Salida de whois.full */
export interface WhoisFullOutput {
  success: boolean;
  domain: string;
  fromCache: boolean;
  /** Presente solo en respuestas de fallback (RDAP sin conexión) */
  isFallback?: boolean;
  registrar: string;
  createdDate: string | null;
  updatedDate: string | null;
  expiresDate: string | null;
  daysRemaining: number | null;
  status: string[];
  nameservers: string[];
  abuseContact: string | null;
  registrantOrg: string | null;
}

/** Salida de osint.whois */
export interface OsintWhoisOutput {
  success: boolean;
  domain: string;
  registrar: string;
  createdDate: string;
  updatedDate: string;
  expiresDate: string;
  daysRemaining: number;
  status: string[];
  nameservers: string[];
}

// ─── Salidas de dns.dnssec / dns.propagation / dns.zone ────────────────────

/** Salida de dns.dnssec */
export interface DnsDnssecOutput {
  domain: string;
  hasDnskey: boolean;
  dnsKeyCount: number;
  hasDs: boolean;
  dsCount: number;
  hasRrsig: boolean;
  dnssecEnabled: boolean;
  dnssecSigned: boolean;
}

/** Resultado de un resolver público en dns.propagation */
export interface ResolverResult {
  resolver: string;
  a: string[];
  mx: string[];
  success: boolean;
  latencyMs: number;
}

/** Salida de dns.propagation */
export interface DnsPropagationOutput {
  domain: string;
  resolverResults: ResolverResult[];
  aConsistent: boolean;
  mxConsistent: boolean;
  resolversChecked: number;
}

/** Salida de dns.zone */
export interface DnsZoneOutput {
  domain: string;
  soa: {
    nsname: string;
    hostmaster: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minttl: number;
  } | null;
  ns: string[];
  mx: MxRecord[];
  a: string[];
  aaaa: string[];
  cname: string[];
  txt: string[];
  srv: unknown[];
  caa: unknown[];
  recordsFound: number;
}

// ─── Salidas de tls.advanced ───────────────────────────────────────────────

/** Detalle de certificado en tls.advanced */
export interface TlsAdvancedCertificate {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  fingerprint: string;
  serialNumber: string;
  subjectAltNames: string[];
  isSelfSigned: boolean;
}

/** Salida de tls.advanced */
export interface TlsAdvancedOutput {
  host: string;
  protocol: string | null;
  cipher: string | null;
  certificate: TlsAdvancedCertificate;
  supportsTls13: boolean;
  supportsTls12: boolean;
  supportsWeakProtocols: string[];
  weakCiphers: string[];
  alpn: string;
}

// ─── Salidas de network.subdomain_takeover / threat.* ──────────────────────

/** Salida de network.subdomain_takeover */
export interface SubdomainTakeoverOutput {
  host: string;
  cnames: string[];
  vulnerable: boolean;
  takeoverService: string | null;
  signaturesChecked: number;
  httpFingerprintsChecked: number;
}

/** CVE individual en threat.cve_lookup */
export interface CveItem {
  id: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  cvssScore: number | null;
  publishedDate: string;
  lastModifiedDate: string;
  exploitabilityScore: number | null;
}

/** Resultado por tecnología en threat.cve_lookup */
export interface CveTechResult {
  name: string;
  version?: string;
  cvesFound: number;
  cves: CveItem[];
}

/** Salida de threat.cve_lookup */
export interface CveLookupOutput {
  host: string;
  techsChecked: number;
  totalCvesFound: number;
  summary: { critical: number; high: number; medium: number; low: number };
  techResults: CveTechResult[];
}

/** Salida de network.bgp */
export interface NetworkBgpOutput {
  host: string;
  prefixes: string[];
  originAsn: string;
  announcingPeers: string[];
  roaValid: boolean;
  rpkiStatus: string;
}

/** Salida de threat.custom_intel */
export interface ThreatCustomIntelOutput {
  domain: string;
  iocMatched: boolean;
  matchedFeeds: string[];
}

// ─── Salidas de website.tech_stack ─────────────────────────────────────────

/** Tecnología detectada por website.tech_stack */
export interface DetectedTechnology {
  name: string;
  category: "web-server" | "framework" | "cms" | "cdn" | "analytics" | "js-library" | "css-library" | "hosting" | "runtime";
  version?: string;
  confidence: number;
  evidence: string;
}

/** Salida de website.tech_stack */
export interface TechnologyProfileOutput {
  url: string;
  host: string;
  technologies: DetectedTechnology[];
  categoriesFound: string[];
  totalDetected: number;
}

// El mapa de salidas tipado por toolId (ToolOutputMap) se deriva automáticamente
// en core/tool-registry.ts vía InferExecutorOutput<ExecutorRegistry[K]> — a medida
// que cada executor declara su TOutput concreto, el mapa se vuelve preciso sin
// mantenimiento manual. No duplicar aquí un mapa estático: colisionaría de nombre
// y quedaría fuera de sync con el registry.

export type InferExecutorInput<T extends ToolExecutor<any, any>> =
  T extends ToolExecutor<infer TInput, any> ? TInput : never;
export type InferExecutorOutput<T extends ToolExecutor<any, any>> =
  T extends ToolExecutor<any, infer TOutput> ? TOutput : never;

export interface ExecutionResult<TOutput> {
  success: boolean;
  output: TOutput;
  findings: Finding[];
  error?: string;
}

export interface ToolExecutor<TInput = unknown, TOutput = unknown> {
  id: string;
  timeoutMs: number;
  category: ToolCategory;
  validate(input: unknown): TInput;
  execute(ctx: ExecutionContext, input: TInput): Promise<ExecutionResult<TOutput>>;
}
