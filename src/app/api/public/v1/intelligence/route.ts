import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { directDb } from '@/shared/db';
import {
  projects,
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceAssets,
} from '@/shared/db/schemas';
import { checkIntelScanRateLimit } from '@/shared/lib/ratelimit';
import { withPublicApi, apiError, apiSuccess, type AuthenticatedRequest } from '@/server/api/public-router';
import { API_SCOPES } from '@/shared/lib/api-keys';
import type { Finding } from '@/server/intelligence/types/executor.types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/intelligence
 * List investigations for a project, or get details of a specific investigation.
 *
 * Query params:
 *   projectId (required) — UUID of the project
 *   investigationId (optional) — UUID of a specific investigation
 *
 * Headers:
 *   Authorization: Bearer <api_key>
 */
export const GET = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const investigationId = searchParams.get('investigationId');

  try {
    if (investigationId) {
      // SECURITY: ownership check — la investigación debe pertenecer a un
      // proyecto del dueño de la API key (evita lectura cross-tenant).
      const investigation = await directDb.query.intelligenceInvestigations.findFirst({
        where: and(
          eq(intelligenceInvestigations.id, investigationId),
          eq(intelligenceInvestigations.ownerId, userId),
        ),
      });

      if (!investigation || investigation.ownerId !== userId) {
        return apiError('Investigation not found', 404);
      }

      const findings = await directDb.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationId),
      });

      const assets = await directDb.query.intelligenceAssets.findMany({
        where: eq(intelligenceAssets.investigationId, investigationId),
      });

      return apiSuccess({
        investigation,
        findings: findings.length,
        assets: assets.length,
        data: { investigation, findings, assets },
      });
    }

    if (!projectId) {
      return apiError('projectId is required', 400);
    }

    // SECURITY: verificar que el proyecto pertenece al dueño de la key
    // antes de listar sus investigaciones.
    const project = await directDb.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    });

    if (!project || project.ownerId !== userId) {
      return apiError('Project not found or access denied', 404);
    }

    const list = await directDb.query.intelligenceInvestigations.findMany({
      where: and(
        eq(intelligenceInvestigations.projectId, projectId),
        eq(intelligenceInvestigations.ownerId, userId),
      ),
      orderBy: [desc(intelligenceInvestigations.createdAt)],
      limit: 50,
    });

    return apiSuccess({ investigations: list });
  } catch (error) {
    console.error('GET /api/public/v1/intelligence error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.intelligenceRead,
});

const scanSchema = z.object({
  target: z.string().min(1).max(2048),
  projectId: z.string().uuid(),
});

/**
 * POST /api/public/v1/intelligence
 * Launch a new infrastructure scan.
 *
 * Body: { target: string, projectId: string }
 * Headers: Authorization: Bearer <api_key>
 */
export const POST = withPublicApi(async (req: AuthenticatedRequest) => {
  const userId = req.apiKeyAuth.userId!;

  try {
    const body = await req.json();
    const parseResult = scanSchema.safeParse(body);

    if (!parseResult.success) {
      return apiError('Invalid arguments: target (string) and projectId (uuid) required', 400);
    }

    const { target, projectId } = parseResult.data;

    // Check project access + ownership
    const project = await directDb.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    });

    if (!project) {
      return apiError('Project not found or access denied', 404);
    }

    // Rate limit: 30 scans/min per user
    const rateLimit = await checkIntelScanRateLimit(userId);
    if (!rateLimit.success) {
      return apiError('Scan rate limit exceeded. Try again later.', 429);
    }

    // Normalize target
    let normalizedTarget = target.trim().toLowerCase();
    if (normalizedTarget.includes('://')) {
      try { normalizedTarget = new URL(normalizedTarget).hostname; } catch {}
    }

    let targetType: 'hostname' | 'email' | 'ip' | 'domain' | 'url' | 'asn' | 'cidr' = 'hostname';
    if (normalizedTarget.includes('@')) targetType = 'email';
    else if (/^[0-9.]+$/.test(normalizedTarget) || normalizedTarget.includes(':')) targetType = 'ip';
    else targetType = 'domain';

    // Create investigation record with running status
    const [investigation] = await directDb.insert(intelligenceInvestigations).values({
      projectId,
      ownerId: userId,
      title: `Auditoria de Infraestructura para ${normalizedTarget}`,
      target,
      normalizedTarget,
      targetType,
      status: 'running',
    }).returning();
    if (!investigation) return apiError('Internal server error', 500);

    // Fire-and-forget: trigger async scan in background
    scanInBackground(investigation.id, projectId, normalizedTarget, userId).catch((err) => {
      console.error(`[public-api] Background scan failed for ${investigation.id}:`, err);
    });

    return apiSuccess({
      investigation: {
        id: investigation.id,
        title: investigation.title,
        target,
        normalizedTarget,
        targetType,
        status: 'running',
        createdAt: investigation.createdAt,
      },
      message: 'Scan started. Check status via GET /api/public/v1/intelligence?investigationId=<id>',
    });    } catch (error) {
    console.error('POST /api/public/v1/intelligence error:', error);
    return apiError('Internal server error', 500);
  }
}, {
  scope: API_SCOPES.intelligenceWrite,
});

/**
 * Background scan execution — imports the dispatcher dynamically
 * to avoid pulling server-only modules into the API route bundle.
 */
async function scanInBackground(
  investigationId: string,
  projectId: string,
  target: string,
  userId: string,
): Promise<void> {
  try {
    const { executeTool } = await import('@/server/intelligence/core/dispatcher');
    const { calculateRiskScore } = await import('@/server/intelligence/core/risk-engine');

    const toolsToRun = [
      { id: 'dns.lookup', cat: 'network' }, { id: 'dns.mx', cat: 'network' },
      { id: 'dns.txt', cat: 'network' }, { id: 'dns.ns', cat: 'network' },
      { id: 'email.spf', cat: 'security' }, { id: 'email.dmarc', cat: 'security' },
      { id: 'email.dkim', cat: 'security' }, { id: 'network.ping', cat: 'network' },
      { id: 'network.reverse_dns', cat: 'network' }, { id: 'network.geoip', cat: 'network' },
      { id: 'network.traceroute', cat: 'network' }, { id: 'network.asn', cat: 'network' },
      { id: 'network.cdn', cat: 'network' }, { id: 'network.waf', cat: 'network' },
      { id: 'network.reverse_ip', cat: 'network' }, { id: 'threat.ip_reputation', cat: 'security' },
      { id: 'website.headers', cat: 'security' }, { id: 'website.security_headers', cat: 'security' },
      { id: 'tls.scan', cat: 'security' }, { id: 'website.robots', cat: 'security' },
      { id: 'osint.whois', cat: 'network' },
    ];

    const results = await Promise.allSettled(
      toolsToRun.map(async (tool) => {
        try {
          return await executeTool(tool.id, target, { target }, projectId, investigationId, userId);
        } catch { return null; }
      }),
    );

    const allFindings: Finding[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.findings) {
        allFindings.push(...r.value.findings);
      }
    }

    const { score } = calculateRiskScore(allFindings);

    // Update investigation with results
    const { intelligenceInvestigations: inv } = await import('@/shared/db/schemas');

    await directDb.update(inv).set({
      status: 'completed',
      score,
      summary: `Scan completed. ${allFindings.length} findings found. Score: ${score}/100`,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inv.id, investigationId));

  } catch (err) {
    console.error('[public-api] Background scan error:', err);
    try {
      const { intelligenceInvestigations: inv } = await import('@/shared/db/schemas');
      await directDb.update(inv).set({
        status: 'failed',
        summary: 'Scan failed',
        completedAt: new Date(),
      }).where(eq(inv.id, investigationId));
    } catch {}
  }
}
