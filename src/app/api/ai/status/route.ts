import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { directDb } from "@/shared/db";
import { aiHealthLogs } from "@/shared/db/schemas/health";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/status — último estado del motor IA ya persistido en
 * ai_health_logs. Lectura barata pensada para el dashboard (OverviewTab):
 * NO testea modelos contra OpenRouter. Eso es /api/ai/healthcheck, una ruta
 * de cron protegida con Bearer CRON_SECRET que el navegador jamás debe llamar
 * (siempre respondería 401).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const [latest] = await directDb
      .select({
        overallStatus: aiHealthLogs.overallStatus,
        modelsHealthy: aiHealthLogs.modelsHealthy,
        modelsFailed: aiHealthLogs.modelsFailed,
        modelsTotal: aiHealthLogs.modelsTotal,
        avgLatencyMs: aiHealthLogs.avgLatencyMs,
        checkedAt: aiHealthLogs.checkedAt,
      })
      .from(aiHealthLogs)
      .orderBy(desc(aiHealthLogs.checkedAt))
      .limit(1);

    if (!latest) {
      // Sin chequeos registrados aún: estado vacío honesto, sin 500.
      return NextResponse.json({
        overallStatus: null,
        modelsHealthy: null,
        modelsFailed: null,
        modelsTotal: null,
        avgLatencyMs: null,
        checkedAt: null,
      });
    }

    return NextResponse.json({
      overallStatus: latest.overallStatus,
      modelsHealthy: latest.modelsHealthy,
      modelsFailed: latest.modelsFailed,
      modelsTotal: latest.modelsTotal,
      avgLatencyMs: latest.avgLatencyMs,
      checkedAt: latest.checkedAt,
    });
  } catch (error) {
    logger.warn("GET /api/ai/status falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      overallStatus: null,
      modelsHealthy: null,
      modelsFailed: null,
      modelsTotal: null,
      avgLatencyMs: null,
      checkedAt: null,
    });
  }
}
