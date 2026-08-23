/**
 * Tipos de la superficie Intelligence del dashboard.
 *
 * Representan el wire format (JSON) que consume el cliente. Derivan del
 * schema canónico cuando aplica; los timestamps son string ISO.
 */

export interface Project {
  id: string;
  name: string;
  domain: string;
}

export interface Investigation {
  id: string;
  projectId: string;
  title: string;
  target: string;
  targetType: string;
  status: string;
  score: number | null;
  summary: string | null;
  metadata?: {
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
  } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Finding {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  evidence: Record<string, unknown> | null;
  affectedAsset: string | null;
  toolId?: string;
}

export interface RunEvent {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  assetType: string;
  value: string;
  ip: string | null;
}
