import { desc, eq } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { audits } from '@/shared/db/schemas';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import { assertProjectAccess } from '@/server/lib/project-access';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/audits?projectId=&limit=
 * Lista auditorías recientes del proyecto (owner o miembro).
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 20), 1), 100);

  try {
    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    const access = await assertProjectAccess(userId, projectId);
    if (!access.ok) {
      return apiError('Project not found or access denied', 404);
    }

    const rows = await directDb.query.audits.findMany({
      where: eq(audits.projectId, projectId),
      orderBy: [desc(audits.createdAt)],
      limit,
      columns: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return apiSuccess({ audits: rows });
  } catch (error) {
    logger.error('GET /api/public/v1/audits error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.intelligenceRead,
});
