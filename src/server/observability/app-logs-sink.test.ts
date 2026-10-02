/**
 * app-logs-sink — captura de errores hacia `app_logs` (ADR-007).
 *
 * Verifica: no-op fuera de producción, truncado del mensaje, cuota de 60
 * inserciones/min, fail-open ante fallos de inserción, envoltura idempotente
 * de console.error con paridad de la salida original, reproducción del JSON
 * del logger (message + code 42501) y persistencia del hook onRequestError.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { insertMock, valuesMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  valuesMock: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  directDb: { insert: insertMock },
}));

async function loadSink() {
  vi.resetModules();
  insertMock.mockReset();
  valuesMock.mockReset();
  valuesMock.mockResolvedValue(undefined);
  insertMock.mockReturnValue({ values: valuesMock });
  return await import("./app-logs-sink");
}

describe("app-logs-sink — captura de errores (ADR-007)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fuera de producción (NODE_ENV≠production) NO inserta", async () => {
    const sink = await loadSink();
    await sink.captureAppError({ message: "boom", source: "console" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("en fase de build NO inserta (NEXT_PHASE)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const sink = await loadSink();
    await sink.captureAppError({ message: "boom", source: "console" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("en producción inserta con mensaje truncado a 2000 chars + code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    await sink.captureAppError({
      message: "x".repeat(5000),
      source: "console",
      code: "42501",
      path: "/api/demo",
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect((row.message as string).length).toBe(2001);
    expect((row.message as string).startsWith("x".repeat(100))).toBe(true);
    expect(row.code).toBe("42501");
    expect(row.source).toBe("console");
    expect(row.path).toBe("/api/demo");
  });

  it("cuota: admite 60 inserciones/min y descarta el resto", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    for (let i = 0; i < 75; i++) {
      await sink.captureAppError({ message: `err ${i}`, source: "console" });
    }
    expect(valuesMock).toHaveBeenCalledTimes(60);
  });

  it("nunca lanza si la inserción falla (fail-open)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    valuesMock.mockRejectedValueOnce(new Error("db down"));
    await expect(
      sink.captureAppError({ message: "boom", source: "console" }),
    ).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("installErrorSink envuelve console.error una sola vez preservando la salida original", async () => {
    const sink = await loadSink();
    const original = console.error;
    try {
      const spy = vi.fn();
      console.error = spy as unknown as typeof console.error;
      sink.installErrorSink();
      sink.installErrorSink();
      console.error("hola");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("hola");
    } finally {
      console.error = original;
    }
  });

  it("envoltura en producción: JSON del logger → message y code 42501, con paridad de salida", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    const original = console.error;
    try {
      const spy = vi.fn();
      console.error = spy as unknown as typeof console.error;
      sink.installErrorSink();
      console.error(
        JSON.stringify({
          timestamp: "2026-10-02T00:00:00.000Z",
          level: "error",
          message: "permission denied for table users (42501)",
          context: { module: "rls" },
        }),
      );
      await vi.waitFor(() => expect(valuesMock).toHaveBeenCalledTimes(1));
      const row = valuesMock.mock.calls[0][0] as Record<string, unknown>;
      expect(row.message).toBe("permission denied for table users (42501)");
      expect(row.code).toBe("42501");
      expect(row.context).toEqual({ module: "rls" });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      console.error = original;
    }
  });

  it("console.error no estructurado → mensaje serializado (paridad con vercel logs)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    const original = console.error;
    try {
      const spy = vi.fn();
      console.error = spy as unknown as typeof console.error;
      sink.installErrorSink();
      console.error("fallo crudo", new Error("raw"));
      await vi.waitFor(() => expect(valuesMock).toHaveBeenCalledTimes(1));
      const row = valuesMock.mock.calls[0][0] as Record<string, unknown>;
      expect(row.message as string).toContain("fallo crudo");
      expect(row.message as string).toContain("raw");
    } finally {
      console.error = original;
    }
  });

  it("captureRequestError registra path, método, digest y code de los 500 de Next", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    const err = Object.assign(new Error("permission denied"), {
      code: "42501",
      digest: "abc123",
    });
    await sink.captureRequestError(
      err,
      { path: "/api/demo?x=1", method: "GET" },
      { routerKind: "App Router", routePath: "/api/demo", routeType: "route" },
    );
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const row = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.source).toBe("request-error");
    expect(row.path).toBe("/api/demo?x=1");
    expect(row.code).toBe("42501");
    const ctx = row.context as Record<string, unknown>;
    expect(ctx.digest).toBe("abc123");
    expect(ctx.method).toBe("GET");
    expect((ctx.route as Record<string, unknown>).routePath).toBe("/api/demo");
  });

  it("captureRequestError con request desconocido no rompe (path opcional)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const sink = await loadSink();
    await sink.captureRequestError("error plano");
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const row = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.message).toBe("error plano");
    expect(row.path).toBeUndefined();
  });
});
