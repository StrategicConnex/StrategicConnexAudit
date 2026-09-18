import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => {
  class MockNextResponse {
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return { body, status: init?.status ?? 200, headers: init?.headers ?? {} };
    }
  }
  return { NextResponse: MockNextResponse, NextRequest: class {} };
});

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn().mockResolvedValue(undefined) },
}));

import { handleApiError, withErrorHandler } from "./error-handler";
import { AppError, NotFoundError, RateLimitError, ValidationError } from "./app-error";

describe("handleApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for NotFoundError", () => {
    const result = handleApiError(new NotFoundError("User", "abc"));
    expect(result.status).toBe(404);
    expect(result.body.code).toBe("NOT_FOUND");
    expect(result.body.error).toContain("abc");
  });

  it("returns 400 for ValidationError", () => {
    const result = handleApiError(new ValidationError("bad", { x: 1 }));
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 with Retry-After header for RateLimitError", () => {
    const result = handleApiError(new RateLimitError("scan", 60));
    expect(result.status).toBe(429);
    expect(result.body.retryAfter).toBe(60);
    expect(result.headers["Retry-After"]).toBe("60");
    expect(result.headers["RateLimit-Reset"]).toBeDefined();
  });

  it("wraps generic Error as 500 INTERNAL_ERROR", () => {
    const result = handleApiError(new Error("something broke"));
    expect(result.status).toBe(500);
    expect(result.body.code).toBe("INTERNAL_ERROR");
    expect(result.body.error).toBe("something broke");
  });

  it("wraps plain string as 500", () => {
    const result = handleApiError("raw string error");
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("raw string error");
  });

  it("wraps unknown value as 500 with default message", () => {
    const result = handleApiError(42);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Error interno del servidor");
  });

  it("no Retry-After header for non-rate-limit errors", () => {
    const result = handleApiError(new AppError("x", "INTERNAL_ERROR", 500));
    expect(result.headers).toEqual({});
  });
});

describe("withErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when handler succeeds", async () => {
    const mockResponse = { status: 200, body: { ok: true } };
    const handler = vi.fn().mockResolvedValue(mockResponse);
    const wrapped = withErrorHandler(handler);

    const req = { url: "http://localhost/api/test" } as never;
    const result = await wrapped(req);

    expect(result).toBe(mockResponse);
    expect(handler).toHaveBeenCalledWith(req);
  });

  it("catches thrown errors and returns error response", async () => {
    const handler = vi.fn().mockRejectedValue(new NotFoundError("Item", "42"));
    const wrapped = withErrorHandler(handler);

    const req = { url: "http://localhost/api/test" } as never;
    const result = await wrapped(req);

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("NOT_FOUND");
  });

  it("passes extra args through", async () => {
    const handler = vi.fn().mockResolvedValue({ status: 200, body: {} });
    const wrapped = withErrorHandler(handler);

    const req = {} as never;
    const extra = "extraArg";
    await wrapped(req, extra);

    expect(handler).toHaveBeenCalledWith(req, extra);
  });
});
