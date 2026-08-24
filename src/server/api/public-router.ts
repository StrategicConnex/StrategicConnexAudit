import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, apiKeyHasScope, type ApiKeyAuthResult, type ApiScope } from '@/shared/lib/api-keys';
import { directDb } from '@/shared/db';
import { securityAuditLogs } from '@/shared/db/schemas';

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
  return async (req: NextRequest, params?: unknown): Promise<NextResponse> => {
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

    // Attach auth info to request and pass to handler
    const authedReq = req as AuthenticatedRequest;
    authedReq.apiKeyAuth = authResult;

    // Fire-and-forget: log API key usage to security audit logs
    // This powers the GET /api/api-keys/:id/usage endpoint for real usage counts
    const keyId = authResult.keyRecord?.id;
    if (keyId) {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
      directDb.insert(securityAuditLogs).values({
        eventType: 'api_key_usage',
        ip: clientIp,
        userId: authResult.userId ?? undefined,
        path: req.nextUrl?.pathname ?? req.url ?? '/unknown',
        method: req.method ?? 'UNKNOWN',
        userAgent: req.headers.get('user-agent') ?? undefined,
        metadata: {
          apiKeyId: keyId,
          keyName: authResult.keyRecord?.name ?? null,
        },
      }).catch((err: Error) => {
        console.error('[public-router] Failed to log API key usage:', err);
      });
    }

    return handler(authedReq, params);
  };
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
