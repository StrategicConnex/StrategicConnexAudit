/**
 * GET /api/intelligence/anomalies
 *
 * Returns anomaly detections for a project. Supports filtering by
 * metric type, severity, date range, and resolution status.
 *
 * Query params:
 *   projectId (required)  — UUID del proyecto
 *   metricType            — Filtrar por tipo: latency | uptime | error_rate | ...
 *   severity              — Filtrar por severidad: critical | warning | info
 *   unresolvedOnly        — true para solo anomalías no resueltas
 *   since                 — ISO timestamp (default: 7 días atrás)
 *   limit                 — Max results (default: 50, max: 500)
 *   offset                — Pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { anomalyDetections } from "@/shared/db/schemas/anomaly";
import { eq, and, desc, isNull, gte, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const metricType = searchParams.get("metricType");
    const severity = searchParams.get("severity");
    const unresolvedOnly = searchParams.get("unresolvedOnly") === "true";
    const since = searchParams.get("since") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId es requerido" }, { status: 400 });
    }

    // Construir condiciones
    const conditions = [eq(anomalyDetections.projectId, projectId)];

    if (metricType) {
      conditions.push(eq(anomalyDetections.metricType, metricType as any));
    }
    if (severity) {
      conditions.push(eq(anomalyDetections.severity, severity as any));
    }
    if (unresolvedOnly) {
      conditions.push(isNull(anomalyDetections.resolvedAt));
    }
    if (since) {
      conditions.push(gte(anomalyDetections.detectedAt, new Date(since)));
    }

    const { anomalies, total, stats } = await withRLS(user.id, async (tx) => {
      const [anomaliesResult, totalResult] = await Promise.all([
        tx
          .select()
          .from(anomalyDetections)
          .where(and(...conditions))
          .orderBy(desc(anomalyDetections.detectedAt))
          .limit(limit)
          .offset(offset),
        tx
          .select({ total: count() })
          .from(anomalyDetections)
          .where(and(...conditions)),
      ]);

      // Obtener estadísticas agregadas por tipo de métrica
      const statsResult = await tx.execute(
        sql`
          SELECT
            metric_type,
            severity,
            count(*) as cnt,
            max(z_score) as max_z
          FROM anomaly_detections
          WHERE project_id = ${projectId}
            AND detected_at >= ${new Date(since)}
          GROUP BY metric_type, severity
          ORDER BY metric_type, severity
        `
      );

      return {
        anomalies: anomaliesResult,
        total: Number(totalResult[0]?.total ?? 0),
        stats: statsResult.rows ?? [],
      };
    });

    return NextResponse.json({
      success: true,
      anomalies,
      total,
      stats,
    });
  } catch (error: any) {
    console.error("[AnomaliesAPI] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
