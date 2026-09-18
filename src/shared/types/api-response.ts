/**
 * Type-safe API response types for SCAUDIT.
 *
 * Provides a consistent response shape across all route handlers.
 *
 * Usage:
 *   return NextResponse.json<ApiResponse<Project>>({ success: true, data: project });
 *   return NextResponse.json<ApiResponseNever>({ success: false, error: "Not found" });
 */

/** Successful response with data. */
export interface ApiResponse<T> {
  success: true;
  data: T;
}

/** Error response. */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  retryAfter?: number;
}

/** Union type for route handlers. */
export type ApiResponseUnion<T> = ApiResponse<T> | ApiErrorResponse;

/** Shorthand for routes that never return data (e.g., DELETE, actions). */
export type ApiResponseNever = ApiErrorResponse;

/** Helper to create a success response. */
export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/** Helper to create an error response. */
export function apiError(
  error: string,
  options?: { code?: string; details?: Record<string, unknown>; retryAfter?: number }
): ApiErrorResponse {
  return {
    success: false,
    error,
    ...(options?.code ? { code: options.code } : {}),
    ...(options?.details ? { details: options.details } : {}),
    ...(options?.retryAfter !== undefined ? { retryAfter: options.retryAfter } : {}),
  };
}
