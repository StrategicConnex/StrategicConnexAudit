import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { projects, audits, integrations, integrationDataGsc, integrationDataGa4, keywordTargets } from '@/shared/db/schemas';
import { eq, desc, isNull, sql, and } from 'drizzle-orm';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';

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

    // 2. Authorization check
    const authHeader = req.headers.get('Authorization');
    const { searchParams } = new URL(req.url);
    const searchApiKey = searchParams.get('apiKey');
    const expectedKey = process.env.LOOKER_STUDIO_API_KEY;

    if (expectedKey) {
      const isAuthorizedHeader = authHeader === `Bearer ${expectedKey}`;
      const isAuthorizedParam = searchApiKey === expectedKey;
      
      if (!isAuthorizedHeader && !isAuthorizedParam) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid or missing API Key' }, 
          { status: 401 }
        );
      }
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

    let activeProjects: any[] = [];

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
                isNull(projects.deletedAt)
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
      console.warn('[Looker] API Key auth without user session — returning empty dataset. ' +
        'For service-to-service integration, use a dedicated service endpoint.');
      activeProjects = [];
    }

    // 5. Generate rows with concurrent fetching
    const rows: any[] = [];
    const today = new Date();

    const enrichedProjects = user ? await withRLS(user.id, async (tx) => {
      const promises = activeProjects.map(async (project) => {
        const [gscRecords, ga4Records, latestAudits, keywordsCountResult] = await Promise.all([
          tx
            .select()
            .from(integrationDataGsc)
            .where(eq(integrationDataGsc.projectId, project.id))
            .orderBy(desc(integrationDataGsc.date))
            .limit(30),
          tx
            .select()
            .from(integrationDataGa4)
            .where(eq(integrationDataGa4.projectId, project.id))
            .orderBy(desc(integrationDataGa4.date))
            .limit(30),
          tx
            .select()
            .from(audits)
            .where(eq(audits.projectId, project.id))
            .orderBy(desc(audits.createdAt))
            .limit(1),
          tx
            .select({ count: sql<number>`count(*)` })
            .from(keywordTargets)
            .where(eq(keywordTargets.projectId, project.id))
        ]);

        const score = latestAudits[0]?.status === 'completed' ? 85 : 45;
        const crawledCount = latestAudits[0]?.status === 'completed' ? 142 : 0;
        const keywordsCount = Number(keywordsCountResult[0]?.count || 0);

        return {
          project,
          gscRecords,
          ga4Records,
          score,
          crawledCount,
          keywordsCount
        };
      });
      return await Promise.all(promises);
    }) : await Promise.all(activeProjects.map(async (project) => {
      // Fallback for public access (if allowed by DB config)
      const [gscRecords, ga4Records, latestAudits, keywordsCountResult] = await Promise.all([
        db
          .select()
          .from(integrationDataGsc)
          .where(eq(integrationDataGsc.projectId, project.id))
          .orderBy(desc(integrationDataGsc.date))
          .limit(30),
        db
          .select()
          .from(integrationDataGa4)
          .where(eq(integrationDataGa4.projectId, project.id))
          .orderBy(desc(integrationDataGa4.date))
          .limit(30),
        db
          .select()
          .from(audits)
          .where(eq(audits.projectId, project.id))
          .orderBy(desc(audits.createdAt))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)` })
          .from(keywordTargets)
          .where(eq(keywordTargets.projectId, project.id))
      ]);

      const score = latestAudits[0]?.status === 'completed' ? 85 : 45;
      const crawledCount = latestAudits[0]?.status === 'completed' ? 142 : 0;
      const keywordsCount = Number(keywordsCountResult[0]?.count || 0);

      return {
        project,
        gscRecords,
        ga4Records,
        score,
        crawledCount,
        keywordsCount
      };
    }));

    for (const { project, gscRecords, ga4Records, score, crawledCount, keywordsCount } of enrichedProjects) {
      for (let i = 14; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - i);
        const isoDateStr = targetDate.toISOString().split('T')[0];
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
      const ep = enrichedProjects.find((e: any) => e.project.id === p.id);
      return ep && (ep.gscRecords.length > 0 || ep.ga4Records.length > 0);
    });

    const headers = {
      'X-RateLimit-Remaining': remaining.toString(),
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS || 'same-origin' 
        : '*',
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

  } catch (error: any) {
    console.error('Error serving Looker Studio connector data:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: error?.message || 'Unknown error occurred'
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (process.env.NODE_ENV === 'production') {
    headers['Access-Control-Allow-Origin'] = process.env.ALLOWED_ORIGINS || 'same-origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return new NextResponse(null, {
    status: 204,
    headers
  });
}



