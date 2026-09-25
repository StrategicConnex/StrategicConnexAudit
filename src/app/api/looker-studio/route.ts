import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { projects, keywordTargets, issues, crawlResults } from '@/shared/db/schemas';
import { eq, isNull, sql, and, count, inArray } from 'drizzle-orm';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';
import { logger } from "@/lib/logger";
import type { DbTransaction } from '@/shared/lib/actions';

interface ProjectData {
  id: string;
  name: string;
  domain: string | null;
  ownerId: string;
}

interface EnrichedProject {
  project: ProjectData;
  gscRecords: { date: string; clicks: number | null; impressions: number | null; ctr: string | null; position: string | null }[];
  ga4Records: { date: string; activeUsers: number | null; conversions: number | null; engagementRate: string | null }[];
  // A-1 honestidad: null = desconocido. Nunca 85/45 ni 142 inventados.
  score: number | null;
  crawledCount: number | null;
  keywordsCount: number;
}

interface LookerStudioRow {
  values: (string | number | null)[];
}

interface RankedGscRow {
  project_id: string;
  date: string;
  clicks: number | null;
  impressions: number | null;
  ctr: string | null;
  position: string | null;
}

interface RankedGa4Row {
  project_id: string;
  date: string;
  activeUsers: number | null;
  conversions: number | null;
  engagementRate: string | null;
}

interface LatestAuditRow {
  project_id: string;
  id: string;
  status: string;
}

/**
 * Enriquecimiento batcheado (fix N+1): 7 queries fijas sin importar cuántos
 * proyectos haya (antes: 4-6 queries POR proyecto dentro de Promise.all).
 * Nota: en raw sql de drizzle un array interpolado aporta sus propios
 * paréntesis → escribir `IN ${ids}` (nunca `IN (${ids})`, que sería doble).
 * Mismas semánticas que antes:
 *  - GSC/GA4: top-30 filas por proyecto (ORDER BY date DESC, rn <= 30).
 *  - Score: última auditoría del proyecto; solo si está completada
 *    (igual que el `.find(a => a.status === 'completed')` sobre limit(1)).
 */
async function enrichProjects(
  tx: DbTransaction,
  activeProjects: ProjectData[]
): Promise<EnrichedProject[]> {
  const projectIds = activeProjects.map((p) => p.id);
  if (projectIds.length === 0) return [];

  const [gscResult, ga4Result, kwRows, latestAuditResult] = await Promise.all([
    tx.execute(sql`
      SELECT project_id, date, clicks, impressions, ctr, position
      FROM (
        SELECT project_id, date, clicks, impressions, ctr, position,
               row_number() OVER (PARTITION BY project_id ORDER BY date DESC) AS rn
        FROM integration_data_gsc
        WHERE project_id IN ${projectIds}
      ) ranked
      WHERE rn <= 30
      ORDER BY project_id, date DESC
    `),
    tx.execute(sql`
      SELECT project_id, date,
             active_users AS "activeUsers",
             conversions,
             engagement_rate AS "engagementRate"
      FROM (
        SELECT project_id, date, active_users, conversions, engagement_rate,
               row_number() OVER (PARTITION BY project_id ORDER BY date DESC) AS rn
        FROM integration_data_ga4
        WHERE project_id IN ${projectIds}
      ) ranked
      WHERE rn <= 30
      ORDER BY project_id, date DESC
    `),
    tx
      .select({ projectId: keywordTargets.projectId, total: count() })
      .from(keywordTargets)
      .where(inArray(keywordTargets.projectId, projectIds))
      .groupBy(keywordTargets.projectId),
    tx.execute(sql`
      SELECT DISTINCT ON (project_id) project_id, id, status
      FROM audits
      WHERE project_id IN ${projectIds}
      ORDER BY project_id, created_at DESC
    `),
  ]);

  const gscByProject = new Map<string, RankedGscRow[]>();
  for (const row of (gscResult.rows ?? []) as unknown as RankedGscRow[]) {
    const list = gscByProject.get(row.project_id);
    if (list) list.push(row);
    else gscByProject.set(row.project_id, [row]);
  }

  const ga4ByProject = new Map<string, RankedGa4Row[]>();
  for (const row of (ga4Result.rows ?? []) as unknown as RankedGa4Row[]) {
    const list = ga4ByProject.get(row.project_id);
    if (list) list.push(row);
    else ga4ByProject.set(row.project_id, [row]);
  }

  const kwByProject = new Map(kwRows.map((r) => [r.projectId, Number(r.total || 0)]));

  const latestByProject = new Map(
    ((latestAuditResult.rows ?? []) as unknown as LatestAuditRow[]).map((r) => [r.project_id, r])
  );
  const completedIds = [...latestByProject.values()]
    .filter((r) => r.status === 'completed')
    .map((r) => r.id);

  const crawlById = new Map<string, number>();
  const issuesById = new Map<string, { critical: number; warning: number }>();
  if (completedIds.length > 0) {
    const [crawlRows, issueRows] = await Promise.all([
      tx
        .select({ auditId: crawlResults.auditId, total: count() })
        .from(crawlResults)
        .where(inArray(crawlResults.auditId, completedIds))
        .groupBy(crawlResults.auditId),
      tx
        .select({
          auditId: issues.auditId,
          criticalCount: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
          warningCount: count(sql`case when ${issues.severity} = 'warning' then 1 end`),
        })
        .from(issues)
        .where(inArray(issues.auditId, completedIds))
        .groupBy(issues.auditId),
    ]);
    for (const row of crawlRows) {
      if (row.auditId) crawlById.set(row.auditId, Number(row.total || 0));
    }
    for (const row of issueRows) {
      if (!row.auditId) continue;
      issuesById.set(row.auditId, {
        critical: Number(row.criticalCount || 0),
        warning: Number(row.warningCount || 0),
      });
    }
  }

  return activeProjects.map((project) => {
    const latest = latestByProject.get(project.id);
    const latestCompleted = latest && latest.status === 'completed' ? latest : undefined;
    let score: number | null = null;
    let crawledCount: number | null = null;
    if (latestCompleted) {
      crawledCount = crawlById.get(latestCompleted.id) ?? 0;
      const stats = issuesById.get(latestCompleted.id);
      score = Math.max(
        0,
        100 - (stats?.critical ?? 0) * 15 - (stats?.warning ?? 0) * 5
      );
    }
    return {
      project,
      gscRecords: gscByProject.get(project.id) ?? [],
      ga4Records: ga4ByProject.get(project.id) ?? [],
      score,
      crawledCount,
      keywordsCount: kwByProject.get(project.id) ?? 0,
    };
  });
}

// Rate limiting store (in-memory for demo, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  const apiKey = request.headers.get('authorization')?.replace('Bearer ', '') || 'no-key';
  return `${ip}:${apiKey}`;
}

function checkRateLimit(key: string, maxRequests: number = 60, windowMs: number = 60000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Rate limiting check
    const rateLimitKey = getRateLimitKey(req);
    const { allowed, remaining } = checkRateLimit(rateLimitKey, 60, 60000);
    
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', message: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // 2. Authorization check (VULN-006 fix): fail-closed, header-only, timing-safe
    // SECURITY: if the env var is missing the endpoint must DENY (fail-closed),
    // never open. The API key is accepted ONLY via `Authorization: Bearer` —
    // never via `?apiKey=` query param (which leaks into logs/referrers).
    const authHeader = req.headers.get('Authorization');
    const { searchParams } = new URL(req.url);
    const expectedKey = process.env.LOOKER_STUDIO_API_KEY;

    if (!expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'LOOKER_STUDIO_API_KEY no configurada en el servidor' },
        { status: 401 }
      );
    }

    const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const isAuthorized =
      provided !== null &&
      provided.length === expectedKey.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expectedKey));

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing API Key' },
        { status: 401 }
      );
    }

    const projectId = searchParams.get('projectId');
    const type = searchParams.get('type') || 'all';
    
    // 3. Define standard Looker Studio schema fields
    const schema = [
      { id: 'date', name: 'Fecha', dataType: 'STRING', semantics: { conceptType: 'DIMENSION', semanticType: 'YEAR_MONTH_DAY' } },
      { id: 'projectName', name: 'Nombre del Proyecto', dataType: 'STRING', semantics: { conceptType: 'DIMENSION', semanticType: 'TEXT' } },
      { id: 'domain', name: 'Dominio', dataType: 'STRING', semantics: { conceptType: 'DIMENSION', semanticType: 'URL' } },
      { id: 'healthScore', name: 'Puntuación de Salud SEO', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'crawledPages', name: 'Páginas Rastrilladas', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'clicks', name: 'Clicks (GSC)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'impressions', name: 'Impresiones (GSC)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'ctr', name: 'CTR Promedio (GSC)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'PERCENT' } },
      { id: 'position', name: 'Posición Promedio (GSC)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'activeUsers', name: 'Usuarios Activos (GA4)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'conversions', name: 'Conversiones (GA4)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } },
      { id: 'engagementRate', name: 'Tasa de Interacción (GA4)', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'PERCENT' } },
      { id: 'trackedKeywords', name: 'Palabras Clave Monitoreadas', dataType: 'NUMBER', semantics: { conceptType: 'METRIC', semanticType: 'NUMBER' } }
    ];

    if (type === 'schema') {
      return NextResponse.json({ schema });
    }

    // 4. Fetch projects using withRLS if user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let activeProjects: ProjectData[] = [];

    if (user) {
      activeProjects = await withRLS(user.id, async (tx) => {
        if (projectId) {
          return await tx
            .select()
            .from(projects)
            .where(
              and(
                eq(projects.id, projectId),
                eq(projects.ownerId, user.id)
              )
            );
        } else {
          return await tx
            .select()
            .from(projects)
            .where(
              and(
                eq(projects.ownerId, user.id),
                and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false))
              )
            );
        }
      });
    } else if (!expectedKey) {
      // No user and no API key configured — return empty
      activeProjects = [];
    } else {
      // SECURITY: API Key presented but no authenticated user session.
      // We do NOT query without RLS — this would expose all projects across tenants.
      // For server-to-server integrations, implement a dedicated /api/service/looker
      // endpoint with a scoped service token and explicit organization filtering.
      logger.warn('[Looker] API Key auth without user session — returning empty dataset. ' +
        'For service-to-service integration, use a dedicated service endpoint.');
      activeProjects = [];
    }

    // 5. Enriquecimiento batcheado — queries fijas, sin N+1 por proyecto.
    //    Sin proyectos (o sin sesión) → sin queries de enriquecimiento.
    const rows: LookerStudioRow[] = [];
    const today = new Date();

    const enrichedProjects: EnrichedProject[] =
      user && activeProjects.length > 0
        ? await withRLS(user.id, (tx) => enrichProjects(tx, activeProjects))
        : [];

    for (const { project, gscRecords, ga4Records, score, crawledCount, keywordsCount } of enrichedProjects) {
      for (let i = 14; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - i);
        const isoDateStr = targetDate.toISOString().split('T')[0]!;
        const dateStr = isoDateStr.replace(/-/g, '');

        const realGsc = gscRecords.find(r => r.date === isoDateStr);
        const realGa4 = ga4Records.find(r => r.date === isoDateStr);

        // PRODUCT: Only use real data. When absent, use 0 instead of synthetic Math.random()
        // values. The `isDemoData` flag in the response meta signals the absence of real data.
        const clicks = realGsc ? Number(realGsc.clicks) : 0;
        const impressions = realGsc ? Number(realGsc.impressions) : 0;
        const ctr = realGsc ? Number(realGsc.ctr) : 0;
        const position = realGsc ? Number(realGsc.position) : 0;

        const activeUsers = realGa4 ? Number(realGa4.activeUsers) : 0;
        const conversions = realGa4 ? Number(realGa4.conversions) : 0;
        const engagementRate = realGa4 ? Number(realGa4.engagementRate) : 0;

        rows.push({
          values: [
            dateStr,
            project.name,
            project.domain,
            score,
            crawledCount,
            clicks,
            impressions,
            ctr,
            position,
            activeUsers,
            conversions,
            engagementRate,
            keywordsCount || 0
          ]
        });
      }
    }

    // 6. Return response with rate limit headers
    const hasRealData = activeProjects.some(p => {
      const ep = enrichedProjects.find((e) => e.project.id === p.id);
      return ep && (ep.gscRecords.length > 0 || ep.ga4Records.length > 0);
    });

    // L-3: 'same-origin' NO es un valor válido de ACAO (los navegadores lo
    // tratan como deny por accidente). Sin allowlist configurada se omite el
    // header: las requests same-origin no necesitan CORS.
    const headers: Record<string, string> = {
      'X-RateLimit-Remaining': remaining.toString(),
      ...(process.env.NODE_ENV === 'production'
        ? (process.env.ALLOWED_ORIGINS ? { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS } : {})
        : { 'Access-Control-Allow-Origin': '*' }),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (type === 'data') {
      return NextResponse.json({ rows }, { headers });
    }

    return NextResponse.json({
      schema,
      rows,
      meta: {
        generatedAt: today.toISOString(),
        totalProjects: activeProjects.length,
        isDemoData: !hasRealData,
        version: "2.1",
        developer: "StrategicAudit Pro Team"
      }
    }, { headers });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error serving Looker Studio connector data:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: errMsg || 'Unknown error occurred occurred'
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Sin allowlist en producción se OMITE el header (same-origin no necesita
  // CORS) en lugar de enviar el valor inválido 'same-origin'.
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOWED_ORIGINS) {
      headers['Access-Control-Allow-Origin'] = process.env.ALLOWED_ORIGINS;
    }
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return new NextResponse(null, {
    status: 204,
    headers
  });
}



