import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { forecasts } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { assertProjectAccess } from "@/server/lib/project-access";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/forecast?projectId= — predicciones a 14 días (C-1).
 * Lectura para owner/miembro. Sin filas = el job semanal aún no corrió.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Falta projectId" }, { status: 400 });
    }
    const access = await assertProjectAccess(user.id, projectId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }
    const rows = await withRLS(user.id, async (tx) =>
      tx.query.forecasts.findMany({
        where: eq(forecasts.projectId, projectId),
      })
    );
    return NextResponse.json({
      success: true,
      forecasts: rows.map((r) => ({
        metric: r.metric,
        current: Number(r.currentValue),
        predicted: Number(r.predictedValue),
        horizonDays: r.horizonDays,
        confidence: Number(r.confidence),
        sampleDays: r.sampleDays,
        trend: (r.metadata as { trend?: string } | null)?.trend ?? "flat",
        updatedAt: r.updatedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error("GET forecast failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
