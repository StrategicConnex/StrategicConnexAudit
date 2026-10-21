"use server";

import { directDb } from "@/shared/db";
import {
  users,
  projects,
  auditLogs,
} from "@/shared/db/schemas";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { aiUsage } from "@/shared/db/schemas/health";
import { count, gte, sql } from "drizzle-orm";
import { assertPlatformAdmin } from "@/server/auth/admin";
import {
  reduceUsageMetrics,
  type UsageMetrics,
} from "@/server/admin/usage-metrics";

const ZERO_METRICS: UsageMetrics = reduceUsageMetrics({
  totalUsers: 0,
  totalProjects: 0,
  auditsLast30d: 0,
  findingsLast30d: [],
  activeUsersLast7d: 0,
  aiLast30d: { calls: 0, tokensIn: null, tokensOut: null, costUsd: null, cacheHits: 0 },
});

export async function getUsageMetrics(): Promise<UsageMetrics> {
  // SECURITY: gate fuera del try/catch — server action invocable que no se
  // ensarta silencio si falla el gate (patrón /ai/health/actions.ts:50-53).
  await assertPlatformAdmin();

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  try {
    const [totalUsersRow, totalProjectsRow, auditsRow, findingsRows, activeRow, aiRow] =
      await Promise.all([
        directDb.select({ n: count(users.id) }).from(users),
        directDb.select({ n: count(projects.id) }).from(projects),
        directDb
          .select({ n: count(auditLogs.id) })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, since30d)),
        directDb
          .select({
            severity: sql<string>`${intelligenceFindings.severity}`,
            n: count(intelligenceFindings.id),
          })
          .from(intelligenceFindings)
          .where(gte(intelligenceFindings.createdAt, since30d))
          .groupBy(intelligenceFindings.severity),
        directDb
          .select({ n: sql<number>`count(distinct ${auditLogs.userId})` })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, since7d)),
        directDb
          .select({
            calls: count(aiUsage.id),
            tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`,
            tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`,
            costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`,
            cacheHits: sql<number>`count(${aiUsage.id}) filter (where ${aiUsage.fromCache})`,
          })
          .from(aiUsage)
          .where(gte(aiUsage.createdAt, since30d)),
      ]);

    return reduceUsageMetrics({
      totalUsers: Number(totalUsersRow[0]?.n ?? 0),
      totalProjects: Number(totalProjectsRow[0]?.n ?? 0),
      auditsLast30d: Number(auditsRow[0]?.n ?? 0),
      findingsLast30d: findingsRows.map((r) => ({
        severity: r.severity,
        n: Number(r.n ?? 0),
      })),
      activeUsersLast7d: Number(activeRow[0]?.n ?? 0),
      aiLast30d: {
        calls: Number(aiRow[0]?.calls ?? 0),
        tokensIn: Number(aiRow[0]?.tokensIn ?? 0) || null,
        tokensOut: Number(aiRow[0]?.tokensOut ?? 0) || null,
        costUsd: Number(aiRow[0]?.costUsd ?? 0) || null,
        cacheHits: Number(aiRow[0]?.cacheHits ?? 0),
      },
    });
  } catch (error) {
    console.error("[admin/usage] queries falló (zeros defensivos):", error);
    return ZERO_METRICS;
  }
}

export async function getUsageDailyAudits(): Promise<Array<{ date: string; n: number }>> {
  await assertPlatformAdmin();
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rows = await directDb
      .select({
        date: sql<string>`to_char(date_trunc('day', ${auditLogs.createdAt}), 'YYYY-MM-DD')`,
        n: count(auditLogs.id),
      })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since30d))
      .groupBy(sql`date_trunc('day', ${auditLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${auditLogs.createdAt}) asc`);
    return rows.map((r) => ({ date: r.date, n: Number(r.n ?? 0) }));
  } catch {
    return [];
  }
}
