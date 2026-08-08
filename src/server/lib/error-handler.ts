/**
 * error-handler.ts — Global API error handler for SCAUDIT.
 *
 * Two exports:
 *   1. handleApiError(err) — wraps any thrown value in a standard NextResponse.
 *   2. withErrorHandler(handler) — HOF that wraps a route handler with a
 *      global try/catch so individual routes never need try {} catch {}.
 *
 * Usage (direct):
 *   try { ... } catch (err) { return handleApiError(err); }
 *
 * Usage (HOF):
 *   export const GET = withErrorHandler(async (req) => { ... });
 *   export const POST = withRateLimit(config, withErrorHandler(async (req, id) => { ... }));
 */

import { NextRequest, NextResponse } from "next/server";
import { ErrorPayload, toAppError } from "./app-error";
import { logger } from "@/shared/lib/logger";

// ─── Response builder ──────────────────────────────────────────────────────

/**
 * Converts any thrown value into a standardised NextResponse.
 * AppError instances are rendered with their own status/retryAfter;
 * everything else becomes a 500 Internal Server Error.
 *
 * All errors are logged via logger.error() for production observability.
 */
export function handleApiError(err: unknown): NextResponse {
  const appErr = toAppError(err);
  const payload: ErrorPayload = appErr.toPayload();

  // Log all errors for observability
  logger.error({
    action: `API_ERROR_${appErr.code}`,
    error: err instanceof Error ? err : new Error(String(err)),
    metadata: {
      code: appErr.code,
      status: appErr.status,
      message: appErr.message,
    },
  }).catch(() => {
    // Fallback: ensure error is visible even if logger throws
    console.error(`[handleApiError] ${appErr.code} ${appErr.status}:`, appErr.message);
  });

  const headers: Record<string, string> = {};

  // Attach Retry-After for 429 responses
  if (appErr.retryAfter !== undefined) {
    headers["Retry-After"] = String(appErr.retryAfter);
    headers["RateLimit-Reset"] = String(
      Math.ceil(Date.now() / 1000) + appErr.retryAfter,
    );
  }

  return NextResponse.json(payload, {
    status: appErr.status,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

// ─── Higher-order function ─────────────────────────────────────────────────

/**
 * Wraps a route handler with a global try/catch that delegates to
 * handleApiError.  Individual routes no longer need their own try {} catch {}.
 *
 * @example
 *   export const GET = withErrorHandler(async (req) => {
 *     const user = await getCurrentUserOrThrow(); // throws AuthError
 *     const data = await db.query(...);
 *     if (!data) throw new NotFoundError("Item", id);
 *     return NextResponse.json({ success: true, data });
 *   });
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (req: NextRequest, ...args: Args) => Promise<NextResponse>,
): (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return async (req: NextRequest, ...args: Args) => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      return handleApiError(err);
    }
  };
}
