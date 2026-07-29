/**
 * history/types.ts — Tipos para el motor de Historial DNS/WHOIS (P0.2)
 */

export interface DnsSnapshot {
  recordType: string;
  query: string;
  value: string;
  ttl: number | null;
  metadata?: Record<string, unknown>;
}

export interface WhoisSnapshot {
  domain: string;
  registrar: string | null;
  createdDate: Date | null;
  expiresDate: Date | null;
  updatedDate: Date | null;
  status: string[];
  nameservers: string[];
  abuseContact: string | null;
  registrantOrg: string | null;
  originalData: Record<string, unknown>;
}

export interface HistoryQueryResult<T> {
  snapshots: T[];
  totalCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  changeCount: number;
}

export interface DnsChange {
  type: 'added' | 'removed' | 'changed';
  recordType: string;
  query: string;
  previousValue: string | null;
  currentValue: string | null;
  detectedAt: Date;
}

export interface WhoisChange {
  field: string;
  label: string;
  previousValue: string | null;
  currentValue: string | null;
  severity: 'info' | 'warning' | 'critical';
  detectedAt: Date;
}

export type HistoryType = 'dns' | 'whois';

export interface HistoryRequest {
  projectId: string;
  type: HistoryType;
  query?: string;     // dominio o IP a filtrar
  recordType?: string; // para DNS: A, AAAA, MX, etc.
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface HistoryTimeline {
  dnsChanges: DnsChange[];
  whoisChanges: WhoisChange[];
  totalChanges: number;
  fromDate: Date;
  toDate: Date;
}
