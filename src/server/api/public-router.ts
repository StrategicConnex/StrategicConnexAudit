import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, apiKeyHasScope, type ApiKeyAuthResult, type ApiScope } from '@/shared/lib/api-keys';
import { directDb } from '@/shared/db';
import { securityAuditLogs } from '@/shared/db/schemas';
import {
  checkRateLimit,
  extractClientIp,
  rateLimitResponse,
  type RateLimitConfig,
  type RateLimitResult,
} from '@/shared/lib/ratelimit';
import { logSecurityEvent } from '@/shared/lib/audit-log';
import { runWithRequestContext } from '@/lib/logger';
import { readRequestId } from '@/lib/request-context';

export interface AuthenticatedRequest extends NextRequest {
  apiKeyAuth: ApiKeyAuthResult;
}

export type RouteHandler = (
  req: AuthenticatedRequest,
  params?: unknown,
) => Promise<NextResponse> | NextResponse;

export interface PublicApiOptions {
  /**
   * Scope requerido para este endpoint. Si la key declara scopes y no incluye
   * el necesario → 403. Keys con scope [] conservan acceso completo (compat).
   */
  scope?: ApiScope;
}

/**
 * Presupuestos de rate limiting de la API pública: sliding window en
 * memoria por instancia (ADR-002 — sin Upstash, ver `ratelimit.ts`).
 *
 * - `ip` se consume en cada request ANTES de autenticar: acota volumen
 *   anónimo y fuerza bruta de keys sin llegar a la BD (la autenticación
 *   es un lookup por hash). 120 req/min por origen es cómodo incluso
 *   tras NAT de oficina.
 * - `key` se consume DESPUÉS de autenticar, identificado por key id:
 *   acota el abuso de una key válida con independencia de la IP de
 *   origen (p. ej. una key robada distribuida entre muchos orígenes).
 *   300 req/min por key.
 */
export const PUBLIC_API_RATE_LIMITS = {
  ip: { limit: 120, window: 60, prefix: 'public_api_ip' },
  key: { limit: 300, window: 60, prefix: 'public_api_key' },
} as const;

interface ApiErrorResponse {
  success: false;
  error: string;
  documentation_url?: string;
}

/**
 * Wraps a public API route handler with API key authentication.
 *
 * Usage:
 *   export const GET = withPublicApi(myHandler);
 *
 * The handler receives an AuthenticatedRequest with `apiKeyAuth` attached.
 */
export function withPublicApi(handler: RouteHandler, options?: PublicApiOptions) {
  // G1 — Correlation IDs: toda la ruta pública corre dentro del scope del
  // `x-request-id`; el scope se refuerza con `userId` tras autenticar la key.
  return (req: NextRequest, params?: unknown): Promise<NextResponse> =>
    runWithRequestContext({ requestId: readRequestId(req) }, () =>
      runPublicRoute(handler, options, req, params)
    );
}

async function runPublicRoute(
  handler: RouteHandler,
  options: PublicApiOptions | undefined,
  req: NextRequest,
  params: unknown
): Promise<NextResponse> {
  const clientIp = extractClientIp(req);
  const ipBudget = await checkRateLimit(clientIp, PUBLIC_API_RATE_LIMITS.ip);
  if (!ipBudget.success) {
    return rateLimitExceeded(req, clientIp, undefined, PUBLIC_API_RATE_LIMITS.ip, ipBudget);
  }

  const authResult = await authenticateApiKey(req);

  if (!authResult.authenticated) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: authResult.error || 'Authentication failed',
      documentation_url: 'https://scaudit.vercel.app/docs/api',
    };

    return NextResponse.json(errorResponse, {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="scaudit-api", error="invalid_token"',
      },
    });
  }

  // Enforcement de scope (M-3): el campo se almacenaba pero nunca se
  // verificaba — toda key era efectivamente full-access.
  if (options?.scope && !apiKeyHasScope(authResult.keyRecord, options.scope)) {
    return NextResponse.json(
      {
        success: false as const,
        error: `API key does not include required scope: ${options.scope}`,
        documentation_url: 'https://scaudit.vercel.app/docs/api',
      },
      { status: 403 },
    );
  }

  const keyId = authResult.keyRecord?.id;
  let budget = ipBudget;
  if (keyId) {
    const keyBudget = await checkRateLimit(`key:${keyId}`, PUBLIC_API_RATE_LIMITS.key);
    if (!keyBudget.success) {
      return rateLimitExceeded(
        req,
        clientIp,
        authResult.userId ?? undefined,
        PUBLIC_API_RATE_LIMITS.key,
        keyBudget
      );
    }
    budget = keyBudget;
  }

  // Attach auth info to request and pass to handler
  const authedReq = req as AuthenticatedRequest;
  authedReq.apiKeyAuth = authResult;

  // Fire-and-forget: log API key usage to security audit logs
  // This powers the GET /api/api-keys/:id/usage endpoint for real usage counts
  if (keyId) {
    directDb.insert(securityAuditLogs).values({
      eventType: 'api_key_usage',
      ip: clientIp,
      userId: authResult.userId ?? undefined,
      path: req.nextUrl?.pathname ?? req.url ?? '/unknown',
      method: req.method ?? 'UNKNOWN',
      userAgent: req.headers.get('user-agent') ?? undefined,
      metadata: {
        ...(readRequestId(req) ? { requestId: readRequestId(req) } : {}),
        apiKeyId: keyId,
        keyName: authResult.keyRecord?.name ?? null,
      },
    }).catch((err: Error) => {
      console.error('[public-router] Failed to log API key usage:', err);
    });
  }

  const response = await runWithRequestContext(
    {
      requestId: readRequestId(req),
      userId: authResult.userId ?? undefined,
    },
    () => handler(authedReq, params)
  );

  return withBudgetHeaders(response, budget);
}

function rateLimitExceeded(
  req: NextRequest,
  ip: string,
  userId: string | undefined,
  config: RateLimitConfig,
  result: RateLimitResult
): NextResponse {
  logSecurityEvent('rate_limit_hit', {
    ip,
    userId,
    path: req.url || '/',
    method: req.method || 'UNKNOWN',
    userAgent: req.headers?.get('user-agent') || undefined,
    metadata: {
      prefix: config.prefix,
      limit: config.limit,
      window: config.window,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: result.retryAfter,
    },
  });
  return rateLimitResponse(result, {
    success: false,
    documentation_url: 'https://scaudit.vercel.app/docs/api',
  });
}

function withBudgetHeaders(response: NextResponse, budget: RateLimitResult): NextResponse {
  const headers = new Headers(response.headers);
  headers.set('RateLimit-Limit', String(budget.limit));
  headers.set('RateLimit-Remaining', String(budget.remaining));
  headers.set('RateLimit-Reset', String(budget.reset));
  headers.set('X-RateLimit-Limit', String(budget.limit));
  headers.set('X-RateLimit-Remaining', String(budget.remaining));
  headers.set('X-RateLimit-Reset', String(budget.reset));
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Returns a standard API error response JSON.
 * Follows JSend-style: { success: false, error: string }
 */
export function apiError(error: string, status: number = 400): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status },
  );
}

/**
 * Returns a standard API success response JSON.
 * Follows JSend-style: { success: true, ...data }
 */
export function apiSuccess(data: Record<string, unknown>, status: number = 200): NextResponse {
  return NextResponse.json(
    { success: true, ...data },
    { status },
  );
}
