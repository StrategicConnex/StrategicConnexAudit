import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Health check result.
 * NOTE: service fields check env var CONFIGURATION, not live connectivity.
 * Full connection validation would be too heavy for a public endpoint
 * and could cause cascading failures if dependencies are slow.
 */
interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  timestamp: string;
  uptime: number;
  services: {
    /** Whether UPSTASH_REDIS_REST_URL + TOKEN are configured */
    redisConfigured: boolean;
    /** Whether DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL are configured */
    dbConfigured: boolean;
  };
  environment: string;
}

const START_TIME = Date.now();

/**
 * GET /api/public/v1/health
 *
 * Public health check — NO API key required. Returns the current status
 * of the SCAUDIT API platform. Useful for:
 *   - Swagger UI quick-start (visitors can test without auth)
 *   - Uptime monitors (Better Stack, Pingdom, etc.)
 *   - CI/CD pipeline connectivity checks
 */
export async function GET() {
  const hasRedisConfig = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  // Config real de la app: DATABASE_URL (pg server-side vía drizzle) +
  // NEXT_PUBLIC_SUPABASE_URL (cliente Supabase Auth). SUPABASE_SERVICE_ROLE_KEY
  // no se usa en ninguna ruta (createAdminClient sin referencias) — no es
  // un indicador de configuración válido para el health público.
  const hasDbConfig = !!(process.env.DATABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL);
  const allServicesConfigured = hasRedisConfig && hasDbConfig;

  const body: HealthCheckResult = {
    status: allServicesConfigured ? 'ok' : hasRedisConfig || hasDbConfig ? 'degraded' : 'down',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    services: {
      redisConfigured: hasRedisConfig,
      dbConfigured: hasDbConfig,
    },
    environment: process.env.NODE_ENV || 'development',
  };

  return NextResponse.json(body, {
    status: allServicesConfigured ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
