import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';
import type { DbExecutor } from '@/shared/db/executor';
import { securityAuditLogs, developerApiKeys } from '@/shared/db/schemas';
import { eq, and, sql, gte } from 'drizzle-orm';
import { withRateLimit } from '@/shared/lib/ratelimit';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys/[id]/usage
 * Returns real usage statistics for a specific API key.
 *
 * Stats are derived from securityAuditLogs where eventType = 'api_key_usage'
 * and metadata->>'apiKeyId' matches the requested key ID.
 *
 * P0.2 · ADR-010: la lectura corre dentro de `withRLS(userId)`. La propiedad de
 * la key la impone la policy `developer_api_keys_select_own`
 * (`user_id = current_auth_uid()`), así que una key de otro usuario es
 * invisible → 404 (antes se leía la fila con `directDb` y se respondía 403,
 * revelando que el id existía). El uso lo habilitan los grants sobre
 * `security_audit_logs` (0047) y la policy de lectura propia
 * `security_audit_logs_self_api_key_usage` (0048), limitada a las filas
 * `event_type = 'api_key_usage'` del propio usuario.
 *
 * Usage data is available from the moment this endpoint was created (after
 * public-router.ts started logging api_key_usage events). For retroactive
 * stats, only lastUsedAt from the developerApiKeys record is available.
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

      const outcome = await withRLS(userId, async (tx: DbExecutor) => {
        // Ownership via RLS: la policy sólo devuelve la key si es del usuario.
        const keyRecord = await tx.query.developerApiKeys.findFirst({
          where: eq(developerApiKeys.id, keyId),
        });

        if (!keyRecord) {
          return { kind: 'not_found' as const };
        }

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

        const [totalResult] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(securityAuditLogs)
          .where(usageFilter);

        const [todayResult] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(securityAuditLogs)
          .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfToday)));

        const [weekResult] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(securityAuditLogs)
          .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfWeek)));

        const [monthResult] = await tx
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(securityAuditLogs)
          .where(and(usageFilter, gte(securityAuditLogs.createdAt, startOfMonth)));

        const dailyRows = await tx
          .select({
            date: sql<string>`${securityAuditLogs.createdAt}::date`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(securityAuditLogs)
          .where(and(usageFilter, gte(securityAuditLogs.createdAt, thirtyDaysAgo)))
          .groupBy(sql`${securityAuditLogs.createdAt}::date`)
          .orderBy(sql`${securityAuditLogs.createdAt}::date`);

        return {
          kind: 'ok' as const,
          payload: {
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
          },
        };
      });

      if (outcome.kind === 'not_found') {
        return NextResponse.json(
          { success: false, error: 'API Key no encontrada' },
          { status: 404 },
        );
      }

      return NextResponse.json({ success: true, ...outcome.payload });
    } catch (error: unknown) {
      logger.error('GET /api/api-keys/[id]/usage failure:', error);
      return NextResponse.json(
        { success: false, error: 'Error interno del servidor' },
        { status: 500 },
      );
    }
  },
);
