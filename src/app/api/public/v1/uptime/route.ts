import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { uptimeLogs } from '@/shared/db/schemas';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import { assertProjectAccess } from '@/server/lib/project-access';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/uptime?projectId=&days=
 * Uptime agregado + últimos chequeos (owner o miembro).
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const days = Math.min(Math.max(Number(searchParams.get('days') || 30), 1), 90);

  try {
    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    const access = await assertProjectAccess(userId, projectId);
    if (!access.ok) {
      return apiError('Project not found or access denied', 404);
    }

    const since = new Date(Date.now() - days * 86400000);
    const [agg] = await directDb
      .select({
        total: sql<number>`count(*)`,
        ups: sql<number>`count(*) filter (where ${uptimeLogs.isUp})`,
        avgLatency: sql<number | null>`avg(${uptimeLogs.responseTimeMs})`,
      })
      .from(uptimeLogs)
      .where(and(eq(uptimeLogs.projectId, projectId), gte(uptimeLogs.checkedAt, since)));

    const checks = await directDb.query.uptimeLogs.findMany({
      where: and(eq(uptimeLogs.projectId, projectId), gte(uptimeLogs.checkedAt, since)),
      orderBy: [desc(uptimeLogs.checkedAt)],
      limit: 100,
      columns: { isUp: true, statusCode: true, responseTimeMs: true, checkedAt: true },
    });

    const total = Number(agg?.total ?? 0);
    const ups = Number(agg?.ups ?? 0);

    return apiSuccess({
      uptimePct: total > 0 ? Math.round((ups / total) * 1000) / 10 : null,
      avgLatencyMs: agg?.avgLatency != null ? Math.round(Number(agg.avgLatency)) : null,
      checks: checks.map((c) => ({
        isUp: c.isUp,
        statusCode: c.statusCode,
        responseTimeMs: c.responseTimeMs,
        checkedAt: c.checkedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('GET /api/public/v1/uptime error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.intelligenceRead,
});
