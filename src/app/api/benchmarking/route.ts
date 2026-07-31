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
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
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
    // 1. Uptime % per project (last 30 days)
    interface UptimeRow extends Record<string, unknown> { projectId: string; isUp: boolean; responseTimeMs: number | null }
    const uptimeResult = await tx.execute<UptimeRow>(
      sql`
        SELECT project_id as "projectId", is_up as "isUp", response_time_ms as "responseTimeMs"
        FROM uptime_logs
        WHERE checked_at >= ${since}
        ORDER BY checked_at DESC
      `
    );

    // 2. Health scores from intelligence_investigations
    interface ScoreRow extends Record<string, unknown> { projectId: string; score: number }
    const scoreResult = await tx.execute<ScoreRow>(
      sql`
        SELECT project_id as "projectId", score
        FROM intelligence_investigations
        WHERE score IS NOT NULL
        ORDER BY created_at DESC
      `
    );

    return { uptimeRows: uptimeResult, scoreRows: scoreResult };
  });

  // Group by project and compute uptime %
  const projectUptimes = new Map<string, { up: number; total: number; latencies: number[] }>();
  for (const row of uptimeRows.rows ?? []) {
    const pid = row.projectId;
    if (!projectUptimes.has(pid)) {
      projectUptimes.set(pid, { up: 0, total: 0, latencies: [] });
    }
    const entry = projectUptimes.get(pid)!;
    entry.total++;
    if (row.isUp) entry.up++;
    if (row.responseTimeMs != null) {
      entry.latencies.push(row.responseTimeMs);
    }
  }

  // Latest score per project
  const projectScores = new Map<string, number[]>();
  for (const row of scoreRows.rows ?? []) {
    const pid = row.projectId;
    if (!projectScores.has(pid)) {
      projectScores.set(pid, []);
    }
    projectScores.get(pid)!.push(row.score);
  }

  // Build metrics array
  const allProjects = new Set([
    ...projectUptimes.keys(),
    ...projectScores.keys(),
  ]);

  const projectMetrics: ProjectMetric[] = [];
  for (const pid of allProjects) {
    const uptime = projectUptimes.get(pid);
    const scores = projectScores.get(pid);
    projectMetrics.push({
      projectId: pid,
      uptimePercent: uptime && uptime.total > 0
        ? Math.round((uptime.up / uptime.total) * 10000) / 100
        : 0,
      avgLatencyMs: uptime && uptime.latencies.length > 0
        ? Math.round(uptime.latencies.reduce((a, b) => a + b, 0) / uptime.latencies.length)
        : 0,
      score: scores && scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
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
  } catch (error: any) {
    console.error("[Benchmarking] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Error al calcular benchmarks",
    }, { status: 500 });
  }
}
