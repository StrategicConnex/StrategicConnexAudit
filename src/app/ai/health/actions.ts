"use server";

import { directDb } from "@/shared/db";
import { aiHealthLogs } from "@/shared/db/schemas/health";
import { desc, gte, sql } from "drizzle-orm";

export type HealthCheckRecord = {
  id: string;
  checkedAt: string;
  overallStatus: "healthy" | "degraded" | "unhealthy";
  modelsHealthy: number;
  modelsFailed: number;
  modelsTotal: number;
  avgLatencyMs: number | null;
  triggerSource: string;
  modelResults: Array<{
    modelId: string;
    status: "healthy" | "degraded" | "failed";
    latencyMs: number | null;
    error?: string | null;
    responseSample?: string | null;
  }>;
};

export type DailyAggregate = {
  date: string;
  totalChecks: number;
  healthyChecks: number;
  degradedChecks: number;
  unhealthyChecks: number;
  avgLatencyMs: number | null;
  totalFailures: number;
};

export type ModelHealthSummary = {
  modelId: string;
  totalChecks: number;
  healthyCount: number;
  degradedCount: number;
  failedCount: number;
  avgLatencyMs: number | null;
  lastStatus: string;
  lastChecked: string | null;
};

/**
 * Fetch the most recent health check records.
 */
export async function getRecentHealthChecks(limit = 50): Promise<HealthCheckRecord[]> {
  try {
    const rows = await directDb
      .select()
      .from(aiHealthLogs)
      .orderBy(desc(aiHealthLogs.checkedAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      checkedAt: r.checkedAt?.toISOString() ?? new Date().toISOString(),
      overallStatus: r.overallStatus as HealthCheckRecord["overallStatus"],
      modelsHealthy: r.modelsHealthy,
      modelsFailed: r.modelsFailed,
      modelsTotal: r.modelsTotal,
      avgLatencyMs: r.avgLatencyMs,
      triggerSource: r.triggerSource,
      modelResults: (r.modelResults ?? []) as HealthCheckRecord["modelResults"],
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch daily aggregated health data for charts (last 30 days).
 */
export async function getDailyAggregates(days = 30): Promise<DailyAggregate[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await directDb
      .select({
        date: sql<string>`date_trunc('day', ${aiHealthLogs.checkedAt})::date`,
        totalChecks: sql<number>`count(*)`,
        healthyChecks: sql<number>`sum(case when ${aiHealthLogs.overallStatus} = 'healthy' then 1 else 0 end)`,
        degradedChecks: sql<number>`sum(case when ${aiHealthLogs.overallStatus} = 'degraded' then 1 else 0 end)`,
        unhealthyChecks: sql<number>`sum(case when ${aiHealthLogs.overallStatus} = 'unhealthy' then 1 else 0 end)`,
        avgLatencyMs: sql<number | null>`avg(${aiHealthLogs.avgLatencyMs})`,
        totalFailures: sql<number>`sum(${aiHealthLogs.modelsFailed})`,
      })
      .from(aiHealthLogs)
      .where(gte(aiHealthLogs.checkedAt, since))
      .groupBy(sql`date_trunc('day', ${aiHealthLogs.checkedAt})::date`)
      .orderBy(sql`date_trunc('day', ${aiHealthLogs.checkedAt})::date`);

    return rows.map((r) => ({
      date: r.date,
      totalChecks: Number(r.totalChecks),
      healthyChecks: Number(r.healthyChecks),
      degradedChecks: Number(r.degradedChecks),
      unhealthyChecks: Number(r.unhealthyChecks),
      avgLatencyMs: r.avgLatencyMs ? Math.round(Number(r.avgLatencyMs)) : null,
      totalFailures: Number(r.totalFailures),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch per-model health summary across all checks.
 */
export async function getModelHealthSummary(): Promise<ModelHealthSummary[]> {
  try {
    const rows = await directDb
      .select()
      .from(aiHealthLogs)
      .orderBy(desc(aiHealthLogs.checkedAt))
      .limit(100);

    // Aggregate per-model from modelResults jsonb
    const modelMap = new Map<string, {
      totalChecks: number;
      healthyCount: number;
      degradedCount: number;
      failedCount: number;
      latencies: number[];
      lastStatus: string;
      lastChecked: string | null;
    }>();

    for (const row of rows) {
      const results = (row.modelResults ?? []) as HealthCheckRecord["modelResults"];
      for (const mr of results) {
        const existing = modelMap.get(mr.modelId) ?? {
          totalChecks: 0,
          healthyCount: 0,
          degradedCount: 0,
          failedCount: 0,
          latencies: [],
          lastStatus: "unknown",
          lastChecked: null,
        };
        existing.totalChecks++;
        if (mr.status === "healthy") existing.healthyCount++;
        else if (mr.status === "degraded") existing.degradedCount++;
        else existing.failedCount++;
        if (mr.latencyMs != null) existing.latencies.push(mr.latencyMs);
        existing.lastStatus = mr.status;
        existing.lastChecked = row.checkedAt?.toISOString() ?? null;
        modelMap.set(mr.modelId, existing);
      }
    }

    return Array.from(modelMap.entries()).map(([modelId, data]) => ({
      modelId,
      totalChecks: data.totalChecks,
      healthyCount: data.healthyCount,
      degradedCount: data.degradedCount,
      failedCount: data.failedCount,
      avgLatencyMs: data.latencies.length > 0
        ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
        : null,
      lastStatus: data.lastStatus,
      lastChecked: data.lastChecked,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the latest health check result (for the summary cards).
 */
export async function getLatestHealthCheck(): Promise<HealthCheckRecord | null> {
  try {
    const [row] = await directDb
      .select()
      .from(aiHealthLogs)
      .orderBy(desc(aiHealthLogs.checkedAt))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      checkedAt: row.checkedAt?.toISOString() ?? new Date().toISOString(),
      overallStatus: row.overallStatus as HealthCheckRecord["overallStatus"],
      modelsHealthy: row.modelsHealthy,
      modelsFailed: row.modelsFailed,
      modelsTotal: row.modelsTotal,
      avgLatencyMs: row.avgLatencyMs,
      triggerSource: row.triggerSource,
      modelResults: (row.modelResults ?? []) as HealthCheckRecord["modelResults"],
    };
  } catch {
    return null;
  }
}
