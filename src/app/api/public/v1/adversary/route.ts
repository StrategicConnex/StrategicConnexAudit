import { desc, eq } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { adversaryAssessments, adversaryRuns, adversaryScenarios } from '@/shared/db/schemas';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import { assertProjectAccess } from '@/server/lib/project-access';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/adversary?projectId=&limit=
 *
 * Resultado de las simulaciones de adversario del proyecto:
 *  - `runs`: ejecuciones de escenarios PURPLE (result detected/missed/error).
 *  - `assessments`: evaluaciones de superficie con su riskScore.
 *
 * `result` es `null` mientras la ejecución no ha terminado: un run sin
 * veredicto NO cuenta como "no detectado" (misma regla que el score purple
 * interno, que excluye lo no evaluable del denominador).
 *
 * Requiere scope `adversary:read`.
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);

  try {
    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    const access = await assertProjectAccess(userId, projectId);
    if (!access.ok) {
      return apiError('Project not found or access denied', 404);
    }

    const runs = await directDb
      .select({
        id: adversaryRuns.id,
        status: adversaryRuns.status,
        result: adversaryRuns.result,
        detectedBy: adversaryRuns.detectedBy,
        completedAt: adversaryRuns.completedAt,
        mitreId: adversaryScenarios.mitreId,
        scenarioName: adversaryScenarios.name,
      })
      .from(adversaryRuns)
      .leftJoin(adversaryScenarios, eq(adversaryRuns.scenarioId, adversaryScenarios.id))
      .where(eq(adversaryRuns.projectId, projectId))
      .orderBy(desc(adversaryRuns.createdAt))
      .limit(limit);

    const assessments = await directDb.query.adversaryAssessments.findMany({
      where: eq(adversaryAssessments.projectId, projectId),
      orderBy: [desc(adversaryAssessments.createdAt)],
      limit: 5,
      columns: {
        id: true,
        status: true,
        target: true,
        riskScore: true,
        summary: true,
        completedAt: true,
      },
    });

    return apiSuccess({
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        result: run.result,
        detectedBy: run.detectedBy,
        mitreId: run.mitreId,
        scenarioName: run.scenarioName,
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
      assessments: assessments.map((a) => ({
        id: a.id,
        status: a.status,
        target: a.target,
        riskScore: a.riskScore,
        summary: a.summary,
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('GET /api/public/v1/adversary error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.adversaryRead,
});
