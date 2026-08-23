import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { directDb } from '@/shared/db';
import { securityAuditLogs, developerApiKeys } from '@/shared/db/schemas';
import { eq, and, sql, gte } from 'drizzle-orm';
import { withRateLimit } from '@/shared/lib/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys/[id]/usage
 * Returns real usage statistics for a specific API key.
 *
 * Stats are derived from securityAuditLogs where eventType = 'api_key_usage'
 * and metadata->>'apiKeyId' matches the requested key ID.
 *
 * Usage data is available from the moment this endpoint was created (after
 * public-router.ts started logging api_key_usage events). For retroactive
 * stats, only lastUsedAt from the developerApiKeys record is available.
 *
 * Response:
 * {
 *   success: true,
 *   keyName: string,
 *   totalRequests: number,
 *   todayRequests: number,
 *   thisWeekRequests: number,
 *   thisMonthRequests: number,
 *   lastUsedAt: string | null,
 *   dailyBreakdown: [ { date: string, count: number }, ... ]
 * }
 */
export const GET = withRateLimit(
  {
    limit: 30,
    window: 60,
    prefix: 'api_key_usage',
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
  },
  async (req: NextRequest, userId: string) => {
    try {
      // Extract key ID from the URL path: /api/api-keys/[id]/usage
      // Using index-of-suffix 'usage' rather than prefix 'api-keys' so the
      // extraction is resilient even if the route tree changes depth.
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/');
      // pathParts = ['', 'api', 'api-keys', '<keyId>', 'usage']
      const keyId = pathParts[pathParts.indexOf('usage') - 1];

      if (!keyId) {
        return NextResponse.json(
          { success: false, error: 'Key ID requerido' },
          { status: 400 },
        );
      }

      // Verify the key exists and belongs to this user
      const keyRecord = await directDb.query.developerApiKeys.findFirst({
        where: eq(developerApiKeys.id, keyId),
      });

      if (!keyRecord) {
        return NextResponse.json(
          { success: false, error: 'API Key no encontrada' },
          { status: 404 },
        );
      }

      if (keyRecord.userId !== userId) {
        return NextResponse.json(
          { success: false, error: 'Acceso denegado' },
          { status: 403 },
        );
      }

      // Query securityAuditLogs for this key's usage
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      // WHERE filter: eventType = 'api_key_usage' AND metadata->>'apiKeyId' = keyId
      const usageFilter = and(
        eq(securityAuditLogs.eventType, 'api_key_usage'),
        sql`${securityAuditLogs.metadata}->>'apiKeyId' = ${keyId}`,
      );

      // Total requests
      const [totalResult] = await directDb
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(securityAuditLogs)
        .where(usageFilter);

      // Today
      const [todayResult] = await directDb
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(securityAuditLogs)
        .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfToday)));

      // This week
      const [weekResult] = await directDb
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(securityAuditLogs)
        .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfWeek)));

      // This month
      const [monthResult] = await directDb
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(securityAuditLogs)
        .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfMonth)));

      // Daily breakdown for last 30 days
      const dailyRows = await directDb
        .select({
          date: sql<string>`${securityAuditLogs.createdAt}::date`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(securityAuditLogs)
        .where(and(usageFilter, gte(securityAuditLogs.createdAt, thirtyDaysAgo)))
        .groupBy(sql`${securityAuditLogs.createdAt}::date`)
        .orderBy(sql`${securityAuditLogs.createdAt}::date`);

      return NextResponse.json({
        success: true,
        keyName: keyRecord.name,
        keyPrefix: keyRecord.keyPrefix,
        totalRequests: totalResult?.count ?? 0,
        todayRequests: todayResult?.count ?? 0,
        thisWeekRequests: weekResult?.count ?? 0,
        thisMonthRequests: monthResult?.count ?? 0,
        lastUsedAt: keyRecord.lastUsedAt?.toISOString() ?? null,
        dailyBreakdown: dailyRows.map((r) => ({
          date: r.date,
          count: r.count,
        })),
      });
    } catch (error: unknown) {
      console.error('GET /api/api-keys/[id]/usage failure:', error);
      return NextResponse.json(
        { success: false, error: 'Error interno del servidor' },
        { status: 500 },
      );
    }
  },
);
