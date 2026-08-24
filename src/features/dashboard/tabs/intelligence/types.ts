/**
 * Tipos de la superficie Intelligence del dashboard.
 *
 * Única fuente de verdad: el schema Drizzle (`@/shared/db/schemas`). Las
 * respuestas API y los payloads Realtime viajan como JSON, por lo que los
 * timestamps se serializan a string ISO con el helper `Serialized`.
 *
 * Solo `metadata` mantiene una interfaz propia: es la proyección tipada del
 * jsonb que consumen GeoMap y NetworkOsintSection.
 */
import type {
  IntelligenceAsset,
  IntelligenceFinding,
  IntelligenceInvestigation,
  IntelligenceRunEvent,
} from "@/shared/db/schemas";

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export interface Project {
  id: string;
  name: string;
  domain: string;
}

/** Proyección tipada del jsonb `metadata` de una investigación. */
export interface IntelligenceMetadata {
  mailHealthCompositeScore?: number;
  infrastructureScore?: number;
  spfParsed?: {
    record: string;
    dnsLookups: number;
    isWeak: boolean;
    weakReason: string | null;
  } | null;
  dmarcParsed?: {
    record: string;
    policy: "none" | "quarantine" | "reject" | "invalid";
    rua: string[];
    ruf: string[];
    adkim: "r" | "s";
    aspf: "r" | "s";
  } | null;
  dkimCount?: number;
  bimiSuccess?: boolean;
  redirectsToHttps?: boolean;
  whois?: {
    success: boolean;
    registrar: string | null;
    createdDate: string | null;
    expiresDate: string | null;
    updatedDate: string | null;
    status: string[];
    nameservers: string[];
    error?: string;
  } | null;
  asnGeo?: {
    success: boolean;
    ipAddress: string | null;
    ipVersion: number | null;
    latitude: number | null;
    longitude: number | null;
    countryName: string | null;
    countryCode: string | null;
    regionName: string | null;
    cityName: string | null;
    zipCode: string | null;
    asn: string | null;
    asName: string | null;
    /** IPs resueltas cuando el objetivo es un hostname dual-stack */
    ipv4?: string | null;
    ipv6?: string | null;
    error?: string;
  } | null;
  reverseDns?: string[] | null;
  ping?: {
    success: boolean;
    latencyMs: number | null;
    port: number | null;
    error?: string;
  } | null;
  cdnWaf?: {
    detected: boolean;
    name: string | null;
    provider: string | null;
  } | null;
  reverseIp?: string[] | null;
  dnsbl?: Array<{
    list: string;
    listed: boolean;
    reason: string | null;
  }> | null;
  traceroute?: Array<{
    hop: number;
    ip: string;
    hostname: string;
    latencyMs: number;
    asn: string | null;
    asnOrg: string | null;
    countryCode: string | null;
    cityName: string | null;
    type: "local" | "isp" | "transit" | "edge" | "destination";
  }> | null;
}

type InvestigationRow = Serialized<
  Pick<
    IntelligenceInvestigation,
    | "id"
    | "projectId"
    | "title"
    | "target"
    | "targetType"
    | "status"
    | "score"
    | "summary"
    | "metadata"
    | "createdAt"
    | "completedAt"
  >
>;

export type Investigation = Omit<InvestigationRow, "metadata" | "createdAt"> & {
  metadata?: IntelligenceMetadata | null;
  /** defaultNow(): siempre presente en filas persistidas; string ISO en el wire */
  createdAt: string;
};

/** Fila wire de hallazgo + toolId extraído de evidence._toolId por la API GET. */
export type Finding = Serialized<
  Pick<
    IntelligenceFinding,
    "id" | "severity" | "title" | "description" | "recommendation" | "evidence" | "affectedAsset"
  >
> & { toolId?: string };

export type RunEvent = Serialized<
  Pick<IntelligenceRunEvent, "id" | "eventType" | "message">
> & {
  /** defaultNow(): siempre presente; string ISO en el wire */
  createdAt: string;
};

export type Asset = Serialized<Pick<IntelligenceAsset, "id" | "assetType" | "value" | "ip">>;
