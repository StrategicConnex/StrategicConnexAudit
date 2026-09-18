import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  AuthError,
  ForbiddenError,
  RateLimitError,
  toAppError,
} from "./app-error";

describe("AppError — base class", () => {
  it("sets name, code, status, details and retryAfter", () => {
    const err = new AppError("boom", "INTERNAL_ERROR", 500, {
      details: { foo: 1 },
      retryAfter: 30,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe("AppError");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.status).toBe(500);
    expect(err.details).toEqual({ foo: 1 });
    expect(err.retryAfter).toBe(30);
    expect(err.message).toBe("boom");
  });

  it("toPayload serialises without retryAfter when undefined", () => {
    const err = new AppError("fail", "VALIDATION_ERROR", 400);
    const payload = err.toPayload();
    expect(payload).toEqual({
      success: false,
      error: "fail",
      code: "VALIDATION_ERROR",
      status: 400,
      details: undefined,
    });
    expect(payload).not.toHaveProperty("retryAfter");
  });

  it("toPayload includes retryAfter when set", () => {
    const err = new AppError("slow", "RATE_LIMIT", 429, { retryAfter: 10 });
    const payload = err.toPayload();
    expect(payload.retryAfter).toBe(10);
  });
});

describe("NotFoundError", () => {
  it("formats message with entity and id", () => {
    const err = new NotFoundError("User", "u123");
    expect(err.message).toBe("User no encontrado: u123");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.status).toBe(404);
  });

  it("formats message without id", () => {
    const err = new NotFoundError("Project");
    expect(err.message).toBe("Project no encontrado");
  });
});

describe("ValidationError", () => {
  it("carries details", () => {
    const err = new ValidationError("bad input", { field: "name" });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ field: "name" });
  });

  it("works without details", () => {
    const err = new ValidationError("missing");
    expect(err.details).toBeUndefined();
  });
});

describe("AuthError", () => {
  it("defaults to 401 with Spanish message", () => {
    const err = new AuthError();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.status).toBe(401);
    expect(err.message).toBe("No autorizado");
  });

  it("accepts custom message", () => {
    const err = new AuthError("token expired");
    expect(err.message).toBe("token expired");
  });
});

describe("ForbiddenError", () => {
  it("defaults to 403 with Spanish message", () => {
    const err = new ForbiddenError();
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);
    expect(err.message).toBe("Acceso denegado");
  });

  it("accepts custom message", () => {
    const err = new ForbiddenError("no access");
    expect(err.message).toBe("no access");
  });
});

describe("RateLimitError", () => {
  it("builds message with prefix and retryAfter", () => {
    const err = new RateLimitError("intel_scan", 30);
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
    expect(err.message).toContain("intel_scan");
    expect(err.message).toContain("30");
  });
});

describe("toAppError", () => {
  it("preserves AppError instances", () => {
    const original = new NotFoundError("X", "1");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps Error as INTERNAL_ERROR with message", () => {
    const err = toAppError(new TypeError("oops"));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.status).toBe(500);
    expect(err.message).toBe("oops");
  });

  it("wraps string as INTERNAL_ERROR", () => {
    const err = toAppError("plain string");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("plain string");
  });

  it("wraps unknown value with default message", () => {
    const err = toAppError(42);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("Error interno del servidor");
  });

  it("includes stack in details in development mode", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const err = toAppError(new Error("dev err"));
      expect(err.details).toBeDefined();
      expect(err.details).toHaveProperty("stack");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("excludes stack in details in non-development mode", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const err = toAppError(new Error("prod err"));
      expect(err.details).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("stack is undefined for non-Error values in development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const err = toAppError("string-val");
      expect(err.details).toBeDefined();
      expect(err.details).toHaveProperty("stack", undefined);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
