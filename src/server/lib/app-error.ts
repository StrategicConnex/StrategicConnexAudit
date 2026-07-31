/**
 * app-error.ts — Typed error classes for the SCAUDIT API.
 *
 * Each error class carries an HTTP status code and a structured payload
 * so that handleApiError() can produce a uniform NextResponse without
 * inspecting error.message strings.
 *
 * Usage:
 *   throw new NotFoundError("Investigation", investigationId);
 *   throw new ValidationError("investigationId is required");
 *   throw new AuthError();
 *   throw new RateLimitError("intel_scan", 30);
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Base class ────────────────────────────────────────────────────────────

export type ErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

export interface ErrorPayload {
  success: false;
  error: string;
  code: ErrorCode;
  status: number;
  details?: Record<string, any>;
  retryAfter?: number;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, any>;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code: ErrorCode,
    status: number,
    options?: { details?: Record<string, any>; retryAfter?: number },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = options?.details;
    this.retryAfter = options?.retryAfter;
  }

  /** Serialises the error into the standard API response shape. */
  toPayload(): ErrorPayload {
    return {
      success: false,
      error: this.message,
      code: this.code,
      status: this.status,
      details: this.details,
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
    };
  }
}

// ─── Concrete error classes ────────────────────────────────────────────────

/**
 * 404 — The requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const msg = id
      ? `${entity} no encontrado: ${id}`
      : `${entity} no encontrado`;
    super(msg, "NOT_FOUND", 404);
  }
}

/**
 * 400 — Input validation failed.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, "VALIDATION_ERROR", 400, { details });
  }
}

/**
 * 401 — Authentication required or session expired.
 */
export class AuthError extends AppError {
  constructor(message = "No autorizado") {
    super(message, "UNAUTHORIZED", 401);
  }
}

/**
 * 403 — Authenticated but not allowed.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, "FORBIDDEN", 403);
  }
}

/**
 * 429 — Rate limit exceeded.
 */
export class RateLimitError extends AppError {
  constructor(prefix: string, retryAfterSeconds: number) {
    super(
      `Límite de solicitudes excedido para ${prefix}. Intenta de nuevo en ${retryAfterSeconds} segundos.`,
      "RATE_LIMIT",
      429,
      { retryAfter: retryAfterSeconds },
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Coerces an unknown thrown value into an AppError.
 * Preserves AppError instances; wraps everything else as INTERNAL_ERROR.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Error interno del servidor";

  return new AppError(message, "INTERNAL_ERROR", 500, {
    details: process.env.NODE_ENV === "development"
      ? { stack: err instanceof Error ? err.stack : undefined }
      : undefined,
  });
}
