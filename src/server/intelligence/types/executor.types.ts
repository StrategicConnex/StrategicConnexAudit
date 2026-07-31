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
