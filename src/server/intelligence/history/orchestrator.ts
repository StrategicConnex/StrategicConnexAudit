/**
 * history/orchestrator.ts — History Orchestrator (P0.2)
 */

import { persistDnsSnapshotsBatch } from "./dns-history";
import { persistWhoisSnapshot } from "./whois-history";
import { detectDnsChanges } from "./dns-history";
import { detectWhoisChanges } from "./whois-history";
import { sendDnsChangeAlerts } from "@/server/security/dns-change-alert";
import type { DnsChange, WhoisChange, WhoisSnapshot } from "./types";

export async function processDnsResults(params: {
  projectId: string;
  investigationId?: string;
  domain: string;
  results: {
    a?: string[];
    aaaa?: string[];
    mx?: Array<{ exchange: string; priority: number }>;
    ns?: string[];
    txt?: string[];
    soa?: Record<string, unknown> | null;
  };
}): Promise<{ snapshotsPersisted: number; changes: DnsChange[] }> {
  const { projectId, investigationId, domain, results } = params;
  const allSnapshots: Array<{
    recordType: string;
    query: string;
    value: string;
    ttl: number | null;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const ip of results.a ?? []) allSnapshots.push({ recordType: "A", query: domain, value: ip, ttl: null });
  for (const ip of results.aaaa ?? []) allSnapshots.push({ recordType: "AAAA", query: domain, value: ip, ttl: null });
  for (const mx of results.mx ?? []) {
    allSnapshots.push({ recordType: "MX", query: domain, value: `${mx.priority} ${mx.exchange}`, ttl: null, metadata: { priority: mx.priority, exchange: mx.exchange } });
  }
  for (const ns of results.ns ?? []) allSnapshots.push({ recordType: "NS", query: domain, value: ns, ttl: null });
  for (const txt of results.txt ?? []) allSnapshots.push({ recordType: "TXT", query: domain, value: txt, ttl: null });

  await persistDnsSnapshotsBatch(projectId, investigationId, allSnapshots);
  const changes = await detectDnsChanges(projectId, domain);

  // Fire SIEM alert for DNS changes (fire-and-forget, no await — non-blocking)
  if (changes.length > 0) {
    sendDnsChangeAlerts(domain, changes).catch((err) =>
      console.error(`[DNS Orchestrator] Error enviando alerta DNS para ${domain}:`, err)
    );
  }

  return { snapshotsPersisted: allSnapshots.length, changes };
}

export async function processWhoisResults(params: {
  projectId: string;
  investigationId?: string;
  domain: string;
  whoisData: Record<string, unknown>;
}): Promise<{ isNew: boolean; changes: WhoisChange[] }> {
  const { projectId, investigationId, domain, whoisData } = params;
  const snapshot: WhoisSnapshot = {
    domain,
    registrar: (whoisData.registrar as string) ?? null,
    createdDate: whoisData.createdDate ? new Date(whoisData.createdDate as string) : null,
    expiresDate: whoisData.expiresDate ? new Date(whoisData.expiresDate as string) : null,
    updatedDate: whoisData.updatedDate ? new Date(whoisData.updatedDate as string) : null,
    status: (whoisData.status as string[]) ?? [],
    nameservers: (whoisData.nameservers as string[]) ?? [],
    abuseContact: (whoisData.abuseContact as string) ?? null,
    registrantOrg: (whoisData.registrantOrg as string) ?? null,
    originalData: whoisData,
  };
  return await persistWhoisSnapshot(projectId, investigationId, snapshot);
}

export async function getProjectHistoryTimeline(projectId: string, domain?: string): Promise<{ dnsChanges: DnsChange[]; whoisChanges: WhoisChange[] }> {
  const [dnsChanges, whoisChanges] = await Promise.all([
    domain ? detectDnsChanges(projectId, domain) : Promise.resolve([] as DnsChange[]),
    domain ? detectWhoisChanges(projectId, domain) : Promise.resolve([] as WhoisChange[]),
  ]);
  return { dnsChanges, whoisChanges };
}
