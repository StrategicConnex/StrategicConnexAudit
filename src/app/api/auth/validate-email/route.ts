import { NextRequest, NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validation";
import { checkEmailRateLimit, extractClientIp, buildRateLimitHeaders, isEmailAllowlisted } from "@/shared/lib/ratelimit";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/validate-email
 *
 * Valida un correo electrónico antes de enviar el magic link.
 * Incluye rate limiting por IP para prevenir enumeración de emails.
 *
 * Rate limit: 40 solicitudes / 60s por IP (sliding window)
 *
 * Body: { email: string }
 * Response (200): { valid: boolean, reason?: string, suggestion?: string }
 * Response (400): { valid: false, reason: string }
 * Response (429): { valid: false, reason: string, retryAfter: number }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Parsear body (necesario para evaluar allowlist de email) ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { valid: false, reason: "El cuerpo de la solicitud no es JSON válido." },
        { status: 400 }
      );
    }

    const { email } = body as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { valid: false, reason: "El correo electrónico es requerido." },
        { status: 400 }
      );
    }

    // ── 2. Rate limiting por IP (cuentas allowlist no se bloquean) ──
    const clientIp = extractClientIp(req);
    const allowlisted = isEmailAllowlisted(email.trim());
    const rateResult = allowlisted
      ? { success: true, limit: 40, remaining: 40, reset: 0, retryAfter: 0 }
      : await checkEmailRateLimit(clientIp);

    if (!rateResult.success) {
      return NextResponse.json(
        {
          valid: false,
          reason: `Demasiadas solicitudes. Intenta de nuevo en ${rateResult.retryAfter} segundos.`,
          retryAfter: rateResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateResult.retryAfter),
            "X-RateLimit-Limit": String(rateResult.limit),
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "X-RateLimit-Reset": String(rateResult.reset),
          },
        }
      );
    }

    // ── 3. Validar email ─────────────────────────────────────────────
    const result = validateEmail(email.trim());

    // ── 4. Construir respuesta con headers de rate limit ─────────────
    const response = NextResponse.json(result, {
      status: result.valid ? 200 : 400,
    });

    // Adjuntar headers de rate limit
    const rlHeaders = buildRateLimitHeaders(rateResult);
    rlHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error("Error validating email:", { error: getErrorMessage(error) })
    return NextResponse.json(
      { valid: false, reason: "Error interno al validar el correo." },
      { status: 500 }
    );
  }
}
