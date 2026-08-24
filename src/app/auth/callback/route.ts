import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import { extractClientIp, checkCallbackRateLimit, rateLimitResponse, isEmailAllowlisted } from '@/shared/lib/ratelimit'
import { logSecurityEvent, eventFromRequest } from '@/shared/lib/audit-log'
import { sanitizeNextPath } from '@/shared/lib/safe-next'

/**
 * Auth callback (code exchange) con rate limiting por IP.
 *
 * El rate limit se evalúa DESPUÉS de intercambiar el `code` por sesión porque
 * el email del usuario solo se conoce una vez autenticado. Las cuentas en la
 * allowlist (isEmailAllowlisted — ej: palacios_juan@hotmail.com) saltan el
 * límite para que nunca queden bloqueadas al clickear magic links repetidos.
 *
 * Rate limit: 10 req / 60s por IP (aplicado a usuarios no-allowlist).
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // SECURITY: Validar que next sea una ruta relativa (no @evil.com, //evil.com)
  // Lógica extraída a sanitizeNextPath (src/shared/lib/safe-next.ts) — cubierta
  // por tests dedicados (RULE-007 v3.1).
  const safeNext = sanitizeNextPath(next)

  // Auditar intentos de open redirect
  if (safeNext !== next) {
    logSecurityEvent("open_redirect_attempt", {
      ...eventFromRequest(request),
      metadata: {
        attemptedNext: next,
        blockedReason: next.startsWith('//')
          ? 'protocol-relative URL'
          : !next.startsWith('/')
          ? 'external domain or malformed'
          : 'unknown',
      },
    });
  }

  if (code) {
    // Fábrica compartida (única implementación del cookie-adapter SSR).
    // En un Route Handler cookieStore.set siempre funciona: el try/catch de
    // la fábrica (pensado para Server Components) nunca se dispara aquí.
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)

    // Rate limit por IP — aplica a TODOS los intentos (incluidos exchanges
    // fallidos, el vector real de brute-force). Las cuentas allowlist nunca
    // se bloquean: el email solo es conocido tras un exchange exitoso.
    const clientIp = extractClientIp(request)
    const allowlisted = !error && user ? isEmailAllowlisted(user.email) : false

    if (!allowlisted) {
      const rateResult = await checkCallbackRateLimit(clientIp)
      if (!rateResult.success) {
        // Auditar evento de rate limit excedido (mismo patrón que withRateLimit)
        logSecurityEvent("rate_limit_hit", {
          ip: clientIp,
          userId: user?.id,
          path: request.url || "/",
          method: "GET",
          userAgent: request.headers?.get("user-agent") || undefined,
          metadata: {
            prefix: "callback_limit",
            limit: rateResult.limit,
            window: 60,
            remaining: rateResult.remaining,
            reset: rateResult.reset,
            retryAfter: rateResult.retryAfter,
          },
        });
        return rateLimitResponse(rateResult)
      }
    }

    if (!error && user) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // Retornar al login con error si algo falla
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
