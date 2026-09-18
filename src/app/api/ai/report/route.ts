import { NextRequest, NextResponse } from 'next/server';
import { logger } from "@/lib/logger";
import { createClient } from '@/shared/lib/supabase/server';
import { withRateLimit } from '@/shared/lib/ratelimit';
import { withRLS } from '@/shared/db/rls';
import { aiReportJobs } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { tasks } from "@trigger.dev/sdk";
import { runAiSeoReport } from "@/trigger/ai-report.trigger";
import { assertAiQuota } from '@/server/ai/ai-usage';
import { generateSeoReport } from '@/server/ai/seo-report-service';
import { assertProjectAccess } from '@/server/lib/project-access';

export const dynamic = 'force-dynamic';

// P2-1: la generación vive en Trigger.dev; la ruta solo encola (<2s) y el
// cliente hace polling a GET status. maxDuration corto a propósito.
export const maxDuration = 30;

export const POST = withRateLimit(
  {
    limit: 10,
    window: 60,
    prefix: "ai_report",
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    }
  },
  async (req: NextRequest, userId: string) => {
    try {
      // Cuota diaria P0-1: antes de cualquier trabajo costoso
      const quota = await assertAiQuota(userId, "seo-report");
      if (quota) return quota;

      const body = await req.json();
      const { projectId } = body;

      if (!projectId) {
        return NextResponse.json({ success: false, error: 'Se requiere el ID de proyecto (projectId)' }, { status: 400 });
      }

      // Crear el job en pending. La policy RLS de ai_report_jobs solo
      // permite insertar en proyectos propios/miembro; además se verifica
      // ownership explícito para un 404 honesto (no 500).
      const access = await assertProjectAccess(userId, projectId);
      if (!access.ok) {
        return NextResponse.json({ success: false, error: 'Proyecto no encontrado o acceso denegado' }, { status: 404 });
      }
      const [job] = await withRLS(userId, async (tx) => {
        return tx
          .insert(aiReportJobs)
          .values({ projectId, userId, status: "pending" })
          .returning({ id: aiReportJobs.id });
      });

      if (!job) {
        return NextResponse.json({ success: false, error: 'No se pudo crear el trabajo' }, { status: 500 });
      }

      try {
        await tasks.trigger<typeof runAiSeoReport>("ai-seo-report-generation", {
          jobId: job.id,
        });
        return NextResponse.json({ success: true, pending: true, jobId: job.id });
      } catch (triggerErr) {
        // Fallback local (dev / Trigger.dev caído): generar en línea con el
        // mismo servicio y cerrar el job en la misma respuesta (contrato sync).
        logger.warn("ai-report: Trigger.dev no disponible, fallback síncrono", {
          error: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
        });
        const result = await generateSeoReport(projectId, userId);
        if (!result.ok) {
          return NextResponse.json({ success: false, error: result.error }, { status: result.status });
        }
        return NextResponse.json({
          success: true,
          report: result.report,
          isFallback: result.isFallback,
          modelUsed: result.modelUsed,
          fromCache: result.fromCache,
        });
      }
    } catch (error) {
      logger.error('Error al encolar reporte IA', { error });
      return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    }
  }
);

/**
 * GET /api/ai/report/status?jobId= — polling del trabajo diferido.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'Falta jobId' }, { status: 400 });
    }
    const row = await withRLS(user.id, async (tx) => {
      const [found] = await tx
        .select()
        .from(aiReportJobs)
        .where(eq(aiReportJobs.id, jobId))
        .limit(1);
      return found ?? null;
    });
    if (!row) {
      // Sin fila visible por RLS: 404 (no revela existencia).
      return NextResponse.json({ success: false, error: 'Trabajo no encontrado' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      status: row.status,
      report: row.report,
      isFallback: row.isFallback,
      modelUsed: row.modelUsed,
      error: row.error,
    });
  } catch (error) {
    logger.error('Error en status de reporte IA', { error });
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
