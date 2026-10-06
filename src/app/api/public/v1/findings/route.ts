import { and, desc, eq } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import { intelligenceFindings } from '@/shared/db/schemas';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import { assertProjectAccess } from '@/server/lib/project-access';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/** Severidades del enum de BD, en orden de gravedad. */
const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * GET /api/public/v1/findings?projectId=&limit=&severity=
 *
 * Hallazgos del proyecto (owner o miembro), de más reciente a más antiguo.
 * `cvssScore` y `mitreId` salen del triage IA y son `null` cuando el hallazgo
 * aún no se ha clasificado — nunca 0 ni cadena vacía (regla de honestidad de
 * datos: un dato ausente se informa como ausente).
 *
 * Requiere scope `findings:read`.
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);
  const severityParam = searchParams.get('severity');

  try {
    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    let severity: FindingSeverity | null = null;
    if (severityParam) {
      if (!(FINDING_SEVERITIES as readonly string[]).includes(severityParam)) {
        return apiError(`severity must be one of: ${FINDING_SEVERITIES.join(', ')}`, 400);
      }
      severity = severityParam as FindingSeverity;
    }

    const access = await assertProjectAccess(userId, projectId);
    if (!access.ok) {
      return apiError('Project not found or access denied', 404);
    }

    const filters = severity
      ? and(eq(intelligenceFindings.projectId, projectId), eq(intelligenceFindings.severity, severity))
      : eq(intelligenceFindings.projectId, projectId);

    const rows = await directDb.query.intelligenceFindings.findMany({
      where: filters,
      orderBy: [desc(intelligenceFindings.createdAt)],
      limit,
      columns: {
        id: true,
        severity: true,
        title: true,
        status: true,
        affectedAsset: true,
        aiTriage: true,
        createdAt: true,
      },
    });

    return apiSuccess({
      findings: rows.map((row) => {
        const triage = (row.aiTriage ?? {}) as { cvssScore?: unknown; mitreId?: unknown };
        return {
          id: row.id,
          severity: row.severity,
          title: row.title,
          status: row.status,
          affectedAsset: row.affectedAsset,
          cvssScore: typeof triage.cvssScore === 'number' ? triage.cvssScore : null,
          mitreId: typeof triage.mitreId === 'string' ? triage.mitreId : null,
          createdAt: row.createdAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (error) {
    logger.error('GET /api/public/v1/findings error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.findingsRead,
});
