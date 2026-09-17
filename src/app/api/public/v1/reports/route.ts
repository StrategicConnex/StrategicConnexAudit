import { desc, eq } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { aiReportJobs } from '@/shared/db/schemas';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import { assertProjectAccess } from '@/server/lib/project-access';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/reports?projectId=
 * Últimos informes SEO completados (owner o miembro). Incluye el contenido
 * (es el entregable que Zapier/Make necesita).
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    const access = await assertProjectAccess(userId, projectId);
    if (!access.ok) {
      return apiError('Project not found or access denied', 404);
    }

    const rows = await directDb.query.aiReportJobs.findMany({
      where: eq(aiReportJobs.projectId, projectId),
      orderBy: [desc(aiReportJobs.createdAt)],
      limit: 5,
      columns: {
        id: true,
        status: true,
        report: true,
        isFallback: true,
        modelUsed: true,
        createdAt: true,
      },
    });

    return apiSuccess({
      reports: rows
        .filter((r) => r.status === "completed")
        .map((r) => ({
          id: r.id,
          report: r.report,
          isFallback: r.isFallback,
          modelUsed: r.modelUsed,
          createdAt: r.createdAt?.toISOString() ?? null,
        })),
    });
  } catch (error) {
    logger.error('GET /api/public/v1/reports error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.reportsRead,
});
