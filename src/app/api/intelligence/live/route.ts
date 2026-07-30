import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/db";
import { uptimeLogs } from "@/shared/db/schemas";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/live?projectId=xxx&investigationId=yyy
 *
 * Returns a snapshot of live metrics for the dashboard:
 *   - Last 5 uptime checks & 24h uptime %
 *   - Latest findings count (critical/high)
 *   - Latest run events
 *
 * Designed for clientside polling (every 15s) — works on Vercel serverless
 * where SSE streams would time out (10s Hobby, 60s Pro).
 */
async function getUptimeSnapshot(projectId?: string | null) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const whereClause = projectId
    ? and(eq(uptimeLogs.projectId, projectId), gte(uptimeLogs.checkedAt, since))
    : gte(uptimeLogs.checkedAt, since);

  const recent = await db
    .select()
    .from(uptimeLogs)
    .where(whereClause)
    .orderBy(desc(uptimeLogs.checkedAt))
    .limit(5);

  if (recent.length === 0) {
    return { checks: [], uptimePercent: null, avgLatencyMs: null };
  }

  const upCount = recent.filter((r) => r.isUp).length;
  const latencyValues = recent
    .filter((r) => r.responseTimeMs != null)
    .map((r) => r.responseTimeMs as number);

  return {
    checks: recent,
    uptimePercent: upCount / recent.length,
    avgLatencyMs:
      latencyValues.length > 0
        ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)
        : null,
  };
}

async function getFindingsSnapshot(investigationId?: string | null) {
  if (!investigationId) return { total: 0, critical: 0, high: 0, latest: [] };

  const [criticalCount, highCount, latest] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(sql`intelligence_findings`)
      .where(
        and(
          sql`investigation_id = ${investigationId}`,
          sql`severity = 'critical'`
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(sql`intelligence_findings`)
      .where(
        and(
          sql`investigation_id = ${investigationId}`,
          sql`severity = 'high'`
        )
      ),
    db.execute(
      sql`
        SELECT id, severity, title, created_at
        FROM intelligence_findings
        WHERE investigation_id = ${investigationId}
          AND severity IN ('critical', 'high')
        ORDER BY created_at DESC
        LIMIT 3
      `
    ),
  ]);

  return {
    total: (criticalCount[0]?.count ?? 0) + (highCount[0]?.count ?? 0),
    critical: criticalCount[0]?.count ?? 0,
    high: highCount[0]?.count ?? 0,
    latest: latest.rows ?? [],
  };
}

async function getEventsSnapshot(investigationId?: string | null) {
  if (!investigationId) return { total: 0, latest: [] };

  const [totalRows, latestRows] = await Promise.all([
    db.execute(
      sql`
        SELECT count(*) as cnt
        FROM intelligence_run_events
        WHERE investigation_id = ${investigationId}
      `
    ),
    db.execute(
      sql`
        SELECT id, event_type, message, created_at
        FROM intelligence_run_events
        WHERE investigation_id = ${investigationId}
        ORDER BY created_at DESC
        LIMIT 5
      `
    ),
  ]);

  return {
    total: Number(totalRows.rows?.[0]?.cnt ?? 0),
    latest: latestRows.rows ?? [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    const [uptime, findings, events] = await Promise.all([
      getUptimeSnapshot(projectId),
      getFindingsSnapshot(investigationId),
      getEventsSnapshot(investigationId),
    ]);

    return NextResponse.json({
      success: true,
      ts: new Date().toISOString(),
      uptime,
      findings,
      events,
    });
  } catch (error: any) {
    console.error("[LiveAPI] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Error al obtener métricas en vivo",
      ts: new Date().toISOString(),
    }, { status: 500 });
  }
}
