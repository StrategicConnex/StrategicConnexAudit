import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, gte, lte, sql, type SQL } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { siemAlertLogs } from "@/shared/db/schemas";
import { directDb } from "@/shared/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    // 2. Parse filters
    const { searchParams } = new URL(req.url);
    const severity = searchParams.get("severity");
    const ruleEventType = searchParams.get("ruleEventType");
    const ip = searchParams.get("ip");
    const status = searchParams.get("status"); // "success" | "failed" | "all"
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // 3. Build conditions
    const conditions: SQL[] = [];

    if (severity && severity !== "all") {
      conditions.push(eq(siemAlertLogs.severity, severity));
    }
    if (ruleEventType && ruleEventType !== "all") {
      conditions.push(eq(siemAlertLogs.ruleEventType, ruleEventType));
    }
    if (ip) {
      conditions.push(sql`${siemAlertLogs.ip} ILIKE ${`%${ip}%`}`);
    }
    if (status && status !== "all") {
      conditions.push(eq(siemAlertLogs.status, status));
    }
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(siemAlertLogs.createdAt, fromDate));
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(siemAlertLogs.createdAt, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 4. Fetch alerts + total count + distinct rule types/severities for filters
    const [alerts, countResult, distinctTypes, distinctSeverities, statusBreakdown] = await Promise.all([
      directDb
        .select()
        .from(siemAlertLogs)
        .where(whereClause)
        .orderBy(desc(siemAlertLogs.createdAt))
        .limit(limit)
        .offset(offset),
      directDb
        .select({ count: sql<number>`count(*)` })
        .from(siemAlertLogs)
        .where(whereClause),
      directDb
        .select({ ruleEventType: siemAlertLogs.ruleEventType })
        .from(siemAlertLogs)
        .groupBy(siemAlertLogs.ruleEventType)
        .orderBy(siemAlertLogs.ruleEventType),
      directDb
        .select({ severity: siemAlertLogs.severity })
        .from(siemAlertLogs)
        .groupBy(siemAlertLogs.severity)
        .orderBy(siemAlertLogs.severity),
      directDb
        .select({
          status: siemAlertLogs.status,
          count: sql<number>`count(*)`,
        })
        .from(siemAlertLogs)
        .where(whereClause)
        .groupBy(siemAlertLogs.status),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    const breakdown: Record<string, number> = {};
    for (const row of statusBreakdown) {
      breakdown[row.status] = Number(row.count);
    }

    return NextResponse.json({
      success: true,
      alerts: alerts.map(a => ({
        ...a,
        responseCode: a.responseCode ?? null,
        errorMessage: a.errorMessage ?? null,
        metadata: a.metadata ?? {},
      })),
      total,
      limit,
      offset,
      ruleTypes: distinctTypes.map(t => t.ruleEventType),
      severities: distinctSeverities.map(s => s.severity),
      breakdown: {
        success: breakdown.success ?? 0,
        failed: breakdown.failed ?? 0,
      },
    });
  } catch (error) {
    console.error("GET /api/security/siem-alerts failure:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
