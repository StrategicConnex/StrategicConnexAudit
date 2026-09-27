import { NextResponse } from 'next/server';
import { withRequestContext } from "@/lib/request-context";

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
async function rawGet() {
  // Config real de la app: DATABASE_URL (pg server-side vía drizzle) +
  // NEXT_PUBLIC_SUPABASE_URL (cliente Supabase Auth). SUPABASE_SERVICE_ROLE_KEY
  // no se usa en ninguna ruta del app (la fábrica admin fue eliminada) — no es
  // un indicador de configuración válido para el health público.
  // El stack de Upstash se eliminó (etapa 2026-09-27): el rate limit y el
  // progreso de PDF ya no dependen de ningún servicio externo.
  const hasPgConfig = !!process.env.DATABASE_URL;
  const hasSupabaseConfig = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasDbConfig = hasPgConfig && hasSupabaseConfig;

  const body: HealthCheckResult = {
    status: hasDbConfig ? 'ok' : hasPgConfig || hasSupabaseConfig ? 'degraded' : 'down',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    services: {
      dbConfigured: hasDbConfig,
    },
    environment: process.env.NODE_ENV || 'development',
  };

  return NextResponse.json(body, {
    status: hasDbConfig ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export const GET = withRequestContext(rawGet);
