import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/shared/config/env'
import { withRateLimit } from '@/shared/lib/ratelimit'
import { logSecurityEvent, eventFromRequest } from '@/shared/lib/audit-log'

/**
 * Handler interno del auth callback (sin rate limiting).
 * El rate limiting se aplica via withRateLimit wrapper.
 */
async function handleCallback(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // SECURITY: Validar que next sea una ruta relativa (no @evil.com, //evil.com)
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

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
    const cookieStore = await cookies()
    const supabase = createServerClient(
      env.supabaseUrl,
      env.supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // Retornar al login con error si algo falla
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}

// Envuelto con withRateLimit genérico (10 req / 60s por IP)
export const GET = withRateLimit(
  { limit: 10, window: 60, prefix: "callback" },
  handleCallback
);
