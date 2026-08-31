import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, gte, lte, ilike, sql, type SQL } from "drizzle-orm";
import { securityAuditLogs } from "@/shared/db/schemas";
import { directDb } from "@/shared/db";
import { requireAdmin } from "@/server/auth/admin";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate + authorize (SECURITY: los logs de seguridad son datos
    // globales de la plataforma — solo rol admin de plataforma puede leerlos)
    const gate = await requireAdmin();
    if (!gate.ok) {
      return gate.response;
    }

    // 2. Parse filters from query params
    const { searchParams } = new URL(req.url);
    const eventType = searchParams.get("eventType");
    const ip = searchParams.get("ip");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const metadataAction = searchParams.get("metadataAction");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // 3. Build filters
    const conditions: SQL[] = [];

    if (eventType && eventType !== "all") {
      conditions.push(eq(securityAuditLogs.eventType, eventType));
    }
    if (ip) {
      conditions.push(ilike(securityAuditLogs.ip, `%${ip}%`));
    }
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(securityAuditLogs.createdAt, fromDate));
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(securityAuditLogs.createdAt, toDate));
      }
    }
    if (metadataAction) {
      // Filter by metadata->>action — supports comma-separated values for OR matching
      const actions = metadataAction.split(",").filter(Boolean);
      if (actions.length === 1) {
        conditions.push(sql`${securityAuditLogs.metadata}->>'action' = ${actions[0]}`);
      } else if (actions.length > 1) {
        conditions.push(
          sql`${securityAuditLogs.metadata}->>'action' IN (${sql.join(actions.map(a => sql`${a}`), sql`, `)})`
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 4. Fetch logs + total count in parallel
    const [logs, countResult] = await Promise.all([
      directDb
        .select()
        .from(securityAuditLogs)
        .where(whereClause)
        .orderBy(desc(securityAuditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      directDb
        .select({ count: sql<number>`count(*)` })
        .from(securityAuditLogs)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    // 5. Get available event types for the filter dropdown
    const distinctTypes = await directDb
      .select({ eventType: securityAuditLogs.eventType })
      .from(securityAuditLogs)
      .groupBy(securityAuditLogs.eventType)
      .orderBy(securityAuditLogs.eventType);

    return NextResponse.json({
      success: true,
      logs,
      total,
      limit,
      offset,
      eventTypes: distinctTypes.map(t => t.eventType),
    });
  } catch (error: unknown) {
    logger.error("GET /api/security/audit-logs failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}
