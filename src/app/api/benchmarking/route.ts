import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

function computeStats(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, p25: 0, p75: 0, p95: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    median: median(sorted),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    count: values.length,
  };
}

// ─── Aggregations ─────────────────────────────────────────────────────────────

interface ProjectMetric {
  projectId: string;
  uptimePercent: number;
  avgLatencyMs: number;
  score: number | null;
}

async function computeAggregates(userId: string, projectId?: string | null) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

  const { uptimeRows, scoreRows } = await withRLS(userId, async (tx) => {
    // 1. Uptime % + avg latency per project (last 30 days) — agregado en SQL
    //    Evita descargar cada fila de uptime_logs a JS: una fila por proyecto.
    interface UptimeRow extends Record<string, unknown> {
      projectId: string;
      up: number;
      total: number;
      avgLatencyMs: number | null;
    }
    const uptimeResult = await tx.execute<UptimeRow>(
      sql`
        SELECT project_id AS "projectId",
               COUNT(*) FILTER (WHERE is_up)::int AS "up",
               COUNT(*)::int AS "total",
               AVG(response_time_ms)::float8 AS "avgLatencyMs"
        FROM uptime_logs
        WHERE checked_at >= ${since}
        GROUP BY project_id
      `
    );

    // 2. Avg health score per project — agregado en SQL (misma semántica que el promedio JS anterior)
    interface ScoreRow extends Record<string, unknown> { projectId: string; score: number | null }
    const scoreResult = await tx.execute<ScoreRow>(
      sql`
        SELECT project_id AS "projectId",
               AVG(score)::float8 AS "score"
        FROM intelligence_investigations
        WHERE score IS NOT NULL
        GROUP BY project_id
      `
    );

    return { uptimeRows: uptimeResult, scoreRows: scoreResult };
  });

  // Una fila por proyecto: GROUP BY ya agregó todo en DB
  const projectUptimes = new Map<string, { up: number; total: number; avgLatencyMs: number | null }>();
  for (const row of uptimeRows.rows ?? []) {
    projectUptimes.set(row.projectId, {
      up: Number(row.up ?? 0),
      total: Number(row.total ?? 0),
      avgLatencyMs: row.avgLatencyMs != null ? Number(row.avgLatencyMs) : null,
    });
  }

  const projectScores = new Map<string, number>();
  for (const row of scoreRows.rows ?? []) {
    if (row.score != null) projectScores.set(row.projectId, Number(row.score));
  }

  // Build metrics array
  const allProjects = new Set([
    ...projectUptimes.keys(),
    ...projectScores.keys(),
  ]);

  const projectMetrics: ProjectMetric[] = [];
  for (const pid of allProjects) {
    const uptime = projectUptimes.get(pid);
    const avgScore = projectScores.get(pid);
    projectMetrics.push({
      projectId: pid,
      uptimePercent: uptime && uptime.total > 0
        ? Math.round((uptime.up / uptime.total) * 10000) / 100
        : 0,
      avgLatencyMs: uptime && uptime.avgLatencyMs != null
        ? Math.round(uptime.avgLatencyMs)
        : 0,
      score: avgScore != null ? Math.round(avgScore) : null,
    });
  }

  // Global stats
  const uptimeValues = projectMetrics.map((m) => m.uptimePercent).filter((v) => v > 0);
  const latencyValues = projectMetrics.map((m) => m.avgLatencyMs).filter((v) => v > 0);
  const scoreValues = projectMetrics
    .map((m) => m.score)
    .filter((v): v is number => v !== null);

  const benchmarks = {
    uptime: computeStats(uptimeValues),
    latency: computeStats(latencyValues),
    healthScore: computeStats(scoreValues),
    totalProjects: allProjects.size,
    computedAt: new Date().toISOString(),
  };

  // Compare specific project
  let yourMetrics: ProjectMetric | null = null;
  let yourPercentile: { uptime: number | null; latency: number | null; score: number | null } = {
    uptime: null,
    latency: null,
    score: null,
  };

  if (projectId) {
    yourMetrics = projectMetrics.find((m) => m.projectId === projectId) ?? null;

    if (yourMetrics && uptimeValues.length > 0) {
      const sortedUptime = [...uptimeValues].sort((a, b) => b - a); // high → low
      const sortedLatency = [...latencyValues].sort((a, b) => a - b); // low → high
      const sortedScore = [...scoreValues].sort((a, b) => b - a); // high → low

      const findPercentile = (value: number, sorted: number[]) => {
        // Count how many projects have >= this value (strictly for latency lower is better)
        const betterCount = sorted.filter((v) => v >= value).length;
        return betterCount > 0 ? Math.round(((betterCount - 1) / sorted.length) * 100) : null;
      };

      yourPercentile = {
        uptime: yourMetrics.uptimePercent > 0
          ? findPercentile(yourMetrics.uptimePercent, sortedUptime)
          : null,
        latency: yourMetrics.avgLatencyMs > 0
          ? findPercentile(yourMetrics.avgLatencyMs, sortedLatency)
          : null,
        score: yourMetrics.score != null
          ? findPercentile(yourMetrics.score, sortedScore)
          : null,
      };
    }
  }

  return { benchmarks, yourMetrics, yourPercentile, projectMetrics };
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    const data = await computeAggregates(user.id, projectId);

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("[Benchmarking] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Error al calcular benchmarks",
    }, { status: 500 });
  }
}
