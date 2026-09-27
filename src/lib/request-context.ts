/**
 * Request-context helpers (G1 — Correlation IDs).
 *
 * `src/lib/logger.ts` owns the AsyncLocalStorage; this module adapts it to
 * the two shapes the app actually needs:
 *
 *   1. `withRequestContext(handler)` — HOF that enters the scope for a route
 *      handler using the `x-request-id` header injected by `src/proxy.ts`.
 *   2. `correlatedHeaders(base)` — headers for *outgoing* fetches so an
 *      external provider (OpenRouter, Anthropic, SIEM webhooks) receives the
 *      same correlation id we log (G3).
 *
 * Both are fail-safe: outside a request scope they degrade to a plain call.
 */

import { getRequestContext, runWithRequestContext, type RequestContext } from "@/lib/logger";

/** Reads `x-request-id` from a Request, Headers object, or nothing. */
export function readRequestId(source: Request | Headers | undefined | null): string | undefined {
  if (!source) return undefined;
  const headers = source instanceof Headers ? source : source.headers;
  if (!headers || typeof headers.get !== "function") return undefined;
  return headers.get("x-request-id") ?? undefined;
}

/**
 * Wraps a route handler so every `logger.*` call made while it runs merges
 * `requestId` into the JSON line. The wrapper is type-preserving: the wrapped
 * function keeps the exact signature of the original.
 *
 * @example
 *   export const GET = withRequestContext(async (req: NextRequest, ctx) => { ... });
 */
export function withRequestContext<T extends (...args: never[]) => unknown>(handler: T): T {
  return ((...args: unknown[]) => {
    const requestId = readRequestId(args[0] as Request | undefined);
    if (!requestId) return handler(...(args as Parameters<T>));
    return runWithRequestContext({ requestId }, () => handler(...(args as Parameters<T>)));
  }) as unknown as T;
}

/** Active correlation id (`correlationId`, falling back to `requestId`). */
export function currentCorrelationId(): string | undefined {
  const store = getRequestContext();
  return store?.correlationId ?? store?.requestId;
}

/**
 * Runs a Trigger.dev task body inside a scope carrying `correlationId` (G2),
 * so every `logger.*` line emitted by the worker merges the same id the
 * enqueueing request logged with. Fail-safe: without a correlation id the
 * body runs untouched (scheduled/cron tasks have no originating request).
 *
 * @example
 *   run: (payload) => runWithCorrelation(payload.correlationId, () => job(payload))
 */
export function runWithCorrelation<T>(correlationId: string | undefined, fn: () => T): T {
  return correlationId ? runWithRequestContext({ correlationId }, fn) : fn();
}

/**
 * Returns `base` plus `x-request-id` when a correlation id is active.
 * Used to propagate correlation across outbound HTTP calls (G3).
 */
export function correlatedHeaders(base: Record<string, string> = {}): Record<string, string> {
  const correlationId = currentCorrelationId();
  return correlationId ? { ...base, "x-request-id": correlationId } : { ...base };
}

/** Type re-export so callers can annotate context objects without a 2nd import. */
export type { RequestContext };
