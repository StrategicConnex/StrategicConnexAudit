import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, gte, lte, sql, type SQL } from "drizzle-orm";
import { siemAlertLogs } from "@/shared/db/schemas";
import { withRLS } from "@/shared/db/rls";
import type { DbExecutor } from "@/shared/db/executor";
import { requireAdmin } from "@/server/auth/admin";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/security/siem-alerts
 *
 * Decisión de diseño (Oleada 3 · P0.2 · ADR-010): esta es una lectura de
 * **datos globales de la plataforma**, no de proyecto — `siem_alert_logs` no
 * tiene `project_id` y su única policy es `current_user_is_platform_admin()`.
 * Se mantiene el gate `requireAdmin()` como primera barrera y se añade la
 * transacción RLS como segunda: las lecturas corren con el rol `authenticated`
 * y la policy vuelve a exigir admin (el grant SELECT de 0047 es lo que permite
 * que la lectura no falle con 42501). Un no-admin nunca llega aquí (gate) y,
 * si lo hiciera, la policy devolvería 0 filas.
 */
async function rawGet(req: NextRequest) {
  try {
    // 1. Authenticate + authorize (SECURITY: alertas SIEM son datos globales
    // de la plataforma — solo rol admin de plataforma puede leerlas)
    const gate = await requireAdmin();
    if (!gate.ok) {
      return gate.response;
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

    // 4. Fetch alerts + total count + distinct rule types/severities for filters.
    // Las 5 consultas van secuenciales DENTRO de la transacción: comparten una
    // única conexión, así que encadenarlas es lo correcto (no un Promise.all).
    const result = await withRLS(gate.userId, async (tx: DbExecutor) => {
      const alerts = await tx
        .select()
        .from(siemAlertLogs)
        .where(whereClause)
        .orderBy(desc(siemAlertLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const countResult = await tx
        .select({ count: sql<number>`count(*)` })
        .from(siemAlertLogs)
        .where(whereClause);

      const distinctTypes = await tx
        .select({ ruleEventType: siemAlertLogs.ruleEventType })
        .from(siemAlertLogs)
        .groupBy(siemAlertLogs.ruleEventType)
        .orderBy(siemAlertLogs.ruleEventType);

      const distinctSeverities = await tx
        .select({ severity: siemAlertLogs.severity })
        .from(siemAlertLogs)
        .groupBy(siemAlertLogs.severity)
        .orderBy(siemAlertLogs.severity);

      const statusBreakdown = await tx
        .select({
          status: siemAlertLogs.status,
          count: sql<number>`count(*)`,
        })
        .from(siemAlertLogs)
        .where(whereClause)
        .groupBy(siemAlertLogs.status);

      const total = Number(countResult[0]?.count ?? 0);

      const breakdown: Record<string, number> = {};
      for (const row of statusBreakdown) {
        breakdown[row.status] = Number(row.count);
      }

      return {
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
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("GET /api/security/siem-alerts failure:", { error: getErrorMessage(error) })
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}

export const GET = withRequestContext(rawGet);
