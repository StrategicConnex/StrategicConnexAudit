/**
 * history/dns-history.ts — DNS History Persistence & Query
 */

import { directDb } from "@/shared/db";
import { dnsHistory } from "@/shared/db/schemas/history";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import crypto from "node:crypto";
import type { DnsSnapshot, HistoryQueryResult, DnsChange } from "./types";
import { logger } from "@/lib/logger";

function hashSnapshot(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
}

export async function persistDnsSnapshot(
  projectId: string,
  investigationId: string | undefined,
  recordType: string,
  query: string,
  value: string,
  ttl: number | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const snapshotStr = `${recordType}:${query}:${value}:${ttl}`;
  const snapshotHash = hashSnapshot(snapshotStr);

  const existing = await directDb
    .select({ id: dnsHistory.id })
    .from(dnsHistory)
    .where(
      and(
        eq(dnsHistory.projectId, projectId),
        eq(dnsHistory.query, query),
        eq(dnsHistory.recordType, recordType),
        eq(dnsHistory.snapshotHash, snapshotHash),
        gte(dnsHistory.createdAt, new Date(Date.now() - 60000)),
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  await directDb.insert(dnsHistory).values({
    projectId,
    investigationId: investigationId ?? null,
    recordType,
    query,
    value,
    ttl,
    snapshotHash,
    snapshotDate: new Date(),
    firstSeenAt: new Date(),
    metadata: metadata ?? {},
  }).catch((err) => {
    logger.error(`[DNS History] Error persistiendo snapshot ${query}:${recordType}:`, err);
  });
}

export async function persistDnsSnapshotsBatch(
  projectId: string,
  investigationId: string | undefined,
  snapshots: Array<{
    recordType: string;
    query: string;
    value: string;
    ttl: number | null;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  for (const snap of snapshots) {
    await persistDnsSnapshot(projectId, investigationId, snap.recordType, snap.query, snap.value, snap.ttl, snap.metadata);
  }
}

export async function queryDnsHistory(params: {
  projectId: string;
  query?: string;
  recordType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}): Promise<HistoryQueryResult<DnsSnapshot>> {
  const { projectId: pid, query, recordType, from, to, limit = 50, offset = 0 } = params;

  const conditions = [eq(dnsHistory.projectId, pid)];
  if (query) conditions.push(eq(dnsHistory.query, query));
  if (recordType) conditions.push(eq(dnsHistory.recordType, recordType));
  if (from) conditions.push(gte(dnsHistory.snapshotDate, from));
  if (to) conditions.push(lte(dnsHistory.snapshotDate, to));

  const rows = await directDb
    .select()
    .from(dnsHistory)
    .where(and(...conditions))
    .orderBy(desc(dnsHistory.snapshotDate))
    .limit(limit)
    .offset(offset);

  const snapshots: (DnsSnapshot & { snapshotDate: string })[] = rows.map((r) => ({
    recordType: r.recordType,
    query: r.query,
    value: r.value,
    ttl: r.ttl,
    metadata: r.metadata ?? undefined,
    snapshotDate: r.snapshotDate.toISOString(),
  }));

  const firstSeen = rows.length > 0
    ? await directDb
        .select({ seenAt: dnsHistory.firstSeenAt })
        .from(dnsHistory)
        .where(and(...conditions))
        .orderBy(dnsHistory.firstSeenAt)
        .limit(1)
        .then((r) => r[0]?.seenAt ?? null)
    : null;

  return { snapshots, totalCount: rows.length, firstSeen, lastSeen: rows[0]?.snapshotDate ?? null, changeCount: 0 };
}

export async function getDnsRecordHistory(projectId: string, query: string, recordType: string, limit = 20): Promise<DnsSnapshot[]> {
  const rows = await directDb
    .select()
    .from(dnsHistory)
    .where(and(eq(dnsHistory.projectId, projectId), eq(dnsHistory.query, query), eq(dnsHistory.recordType, recordType)))
    .orderBy(desc(dnsHistory.snapshotDate))
    .limit(limit);
  return rows.map((r) => ({ recordType: r.recordType, query: r.query, value: r.value, ttl: r.ttl, metadata: r.metadata ?? undefined }));
}

export async function detectDnsChanges(projectId: string, query: string): Promise<DnsChange[]> {
  const changes: DnsChange[] = [];
  const types = await directDb
    .select({ recordType: dnsHistory.recordType })
    .from(dnsHistory)
    .where(and(eq(dnsHistory.projectId, projectId), eq(dnsHistory.query, query)))
    .groupBy(dnsHistory.recordType);

  for (const { recordType } of types) {
    const snapshots = await directDb
      .select({ value: dnsHistory.value, snapshotDate: dnsHistory.snapshotDate })
      .from(dnsHistory)
      .where(and(eq(dnsHistory.projectId, projectId), eq(dnsHistory.query, query), eq(dnsHistory.recordType, recordType)))
      .orderBy(desc(dnsHistory.snapshotDate))
      .limit(2);

    if (snapshots.length >= 2) {
      if (snapshots[1]!.value !== snapshots[0]!.value) {
        changes.push({ type: 'changed', recordType, query, previousValue: snapshots[1]!.value, currentValue: snapshots[0]!.value, detectedAt: snapshots[0]!.snapshotDate });
      }
    } else if (snapshots.length === 1) {
      changes.push({ type: 'added', recordType, query, previousValue: null, currentValue: snapshots[0]!.value, detectedAt: snapshots[0]!.snapshotDate });
    }
  }
  return changes;
}
