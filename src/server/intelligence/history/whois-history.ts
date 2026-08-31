/**
 * history/whois-history.ts — WHOIS History Persistence & Query
 */

import { directDb } from "@/shared/db";
import { whoisHistory } from "@/shared/db/schemas/history";
import { and, eq, desc, gte, lte } from "drizzle-orm";
import crypto from "node:crypto";
import type { WhoisSnapshot, HistoryQueryResult, WhoisChange } from "./types";
import { logger } from "@/lib/logger";

function hashSnapshot(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
}

export async function persistWhoisSnapshot(
  projectId: string,
  investigationId: string | undefined,
  snapshot: WhoisSnapshot,
): Promise<{ isNew: boolean; changes: WhoisChange[] }> {
  const snapshotStr = JSON.stringify(snapshot.originalData);
  const snapshotHash = hashSnapshot(snapshotStr);
  const changes: WhoisChange[] = [];
  let prevFirstSeen: Date | null = null;

  const lastSnapshot = await directDb
    .select()
    .from(whoisHistory)
    .where(and(eq(whoisHistory.projectId, projectId), eq(whoisHistory.domain, snapshot.domain)))
    .orderBy(desc(whoisHistory.snapshotDate))
    .limit(1);

  let diffSummary: string | null = null;

  if (lastSnapshot.length > 0) {
    const prev = lastSnapshot[0]!;
    prevFirstSeen = prev.firstSeenAt;

    if (prev.registrar !== snapshot.registrar) {
      changes.push({ field: 'registrar', label: 'Registrador', previousValue: prev.registrar, currentValue: snapshot.registrar, severity: 'warning', detectedAt: new Date() });
    }
    if (prev.expiresDate?.getTime() !== snapshot.expiresDate?.getTime()) {
      changes.push({ field: 'expiresDate', label: 'Fecha de Expiración', previousValue: prev.expiresDate?.toISOString() ?? null, currentValue: snapshot.expiresDate?.toISOString() ?? null, severity: 'critical', detectedAt: new Date() });
    }
    const prevNs = (prev.nameservers as string[]) ?? [];
    const currNs = snapshot.nameservers;
    if (JSON.stringify(prevNs) !== JSON.stringify(currNs)) {
      changes.push({ field: 'nameservers', label: 'Nameservers', previousValue: prevNs.join(', '), currentValue: currNs.join(', '), severity: 'warning', detectedAt: new Date() });
    }
    if (prev.registrantOrg !== snapshot.registrantOrg) {
      changes.push({ field: 'registrantOrg', label: 'Organización Registrante', previousValue: prev.registrantOrg, currentValue: snapshot.registrantOrg, severity: 'warning', detectedAt: new Date() });
    }
    if (changes.length > 0) {
      diffSummary = changes.map((c) => `${c.label}: ${c.previousValue ?? '(none)'} → ${c.currentValue ?? '(none)'}`).join('; ');
    }
  }

  const isNew = lastSnapshot.length === 0 || changes.length > 0;

  if (isNew) {
    await directDb.insert(whoisHistory).values({
      projectId, investigationId: investigationId ?? null,
      domain: snapshot.domain, registrar: snapshot.registrar,
      createdDate: snapshot.createdDate, expiresDate: snapshot.expiresDate, updatedDate: snapshot.updatedDate,
      status: snapshot.status, nameservers: snapshot.nameservers,
      abuseContact: snapshot.abuseContact, registrantOrg: snapshot.registrantOrg,
      snapshotHash, snapshotDate: new Date(),
      diffSummary, originalSnapshot: snapshot.originalData,
      firstSeenAt: prevFirstSeen ?? new Date(),
    }).catch((err) => {
      logger.error(`[WHOIS History] Error persistiendo snapshot para ${snapshot.domain}:`, err);
    });
  }

  return { isNew, changes };
}

export async function queryWhoisHistory(params: {
  projectId: string;
  domain?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<HistoryQueryResult<WhoisSnapshot>> {
  const { projectId: pid, domain, from, to, limit = 50, offset = 0 } = params;
  const conditions = [eq(whoisHistory.projectId, pid)];
  if (domain) conditions.push(eq(whoisHistory.domain, domain));
  if (from) conditions.push(gte(whoisHistory.snapshotDate, from));
  if (to) conditions.push(lte(whoisHistory.snapshotDate, to));

  const rows = await directDb.select().from(whoisHistory).where(and(...conditions)).orderBy(desc(whoisHistory.snapshotDate)).limit(limit).offset(offset);

  const snapshots: (WhoisSnapshot & { snapshotDate: string })[] = rows.map((r) => ({
    domain: r.domain, registrar: r.registrar,
    createdDate: r.createdDate, expiresDate: r.expiresDate, updatedDate: r.updatedDate,
    status: (r.status as string[]) ?? [], nameservers: (r.nameservers as string[]) ?? [],
    abuseContact: r.abuseContact ?? null, registrantOrg: r.registrantOrg ?? null,
    originalData: (r.originalSnapshot as Record<string, unknown>) ?? {},
    snapshotDate: r.snapshotDate.toISOString(),
  }));

  const firstSeen = rows.length > 0
    ? await directDb.select({ seenAt: whoisHistory.firstSeenAt }).from(whoisHistory).where(and(...conditions)).orderBy(whoisHistory.firstSeenAt).limit(1).then((r) => r[0]?.seenAt ?? null)
    : null;

  return { snapshots, totalCount: rows.length, firstSeen, lastSeen: rows[0]?.snapshotDate ?? null, changeCount: rows.filter((r) => r.diffSummary !== null).length };
}

export async function getWhoisDomainHistory(projectId: string, domain: string, limit = 20): Promise<WhoisSnapshot[]> {
  const rows = await directDb.select().from(whoisHistory).where(and(eq(whoisHistory.projectId, projectId), eq(whoisHistory.domain, domain))).orderBy(desc(whoisHistory.snapshotDate)).limit(limit);
  return rows.map((r) => ({
    domain: r.domain, registrar: r.registrar,
    createdDate: r.createdDate, expiresDate: r.expiresDate, updatedDate: r.updatedDate,
    status: (r.status as string[]) ?? [], nameservers: (r.nameservers as string[]) ?? [],
    abuseContact: r.abuseContact ?? null, registrantOrg: r.registrantOrg ?? null,
    originalData: (r.originalSnapshot as Record<string, unknown>) ?? {},
  }));
}

export async function detectWhoisChanges(projectId: string, domain: string): Promise<WhoisChange[]> {
  const snapshots = await directDb.select().from(whoisHistory).where(and(eq(whoisHistory.projectId, projectId), eq(whoisHistory.domain, domain))).orderBy(desc(whoisHistory.snapshotDate)).limit(2);
  if (snapshots.length < 2) return [];

  const curr = snapshots[0]!;
  const changes: WhoisChange[] = [];

  if (curr.diffSummary) {
    const parts = curr.diffSummary.split('; ');
    for (const part of parts) {
      const match = part.match(/^([^:]+): (.+) → (.+)$/);
      if (match) {
        const field = match[1]!.toLowerCase().replace(/[^a-z0-9]/g, '');
        changes.push({
          field, label: match[1]!,
          previousValue: match[2]! === '(none)' ? null : match[2] ?? null,
          currentValue: match[3]! === '(none)' ? null : match[3] ?? null,
          severity: field === 'expiresdate' ? 'critical' as const : 'warning' as const,
          detectedAt: curr.snapshotDate,
        });
      }
    }
  }
  return changes;
}
