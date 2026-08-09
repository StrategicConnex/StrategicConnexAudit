import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/db", () => ({
  directDb: { insert: insertMock },
}));
vi.mock("@/shared/db/schemas", () => ({ auditLogs: {} }));
vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { logger } from "./logger";

describe("logger — security & performance logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({
      values: vi.fn(async () => undefined),
    }));
    headersMock.mockResolvedValue({
      get: (n: string) => (n === "x-forwarded-for" ? "203.0.113.7" : "TestAgent/1.0"),
    });
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info loguea a consola sin persistir en DB", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await logger.info({ action: "PROJECT_CREATED", projectId: "p1" });
    expect(spy).toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("security persiste en auditLogs con IP y User-Agent del request", async () => {
    const valuesSpy = vi.fn(async (_values: {
      action?: string; ipAddress?: string; userAgent?: string; userId?: string;
      newData?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await logger.security({ action: "LOGIN_FAILED", userId: "u1", projectId: "p1" });

    expect(insertMock).toHaveBeenCalled();
    const values = valuesSpy.mock.calls[0]![0]!;
    expect(values.action).toContain("LOGIN_FAILED");
    expect(values.ipAddress).toBe("203.0.113.7");
    expect(values.userAgent).toBe("TestAgent/1.0");
    expect(values.userId).toBe("u1");
  });

  it("error persiste el mensaje del Error y el stack solo fuera de producción", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const valuesSpy = vi.fn(async (_values: {
      action?: string; ipAddress?: string; userAgent?: string; userId?: string;
      newData?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await logger.error({ action: "EXECUTOR_FAILED", error: new Error("boom detallado") });

    const values = valuesSpy.mock.calls[0]![0]!;
    expect(values.newData?.error).toBe("boom detallado");
    expect(values.newData?.stack).toBeTruthy();
  });

  it("error NO incluye stack en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const valuesSpy = vi.fn(async (_values: {
      action?: string; ipAddress?: string; userAgent?: string; userId?: string;
      newData?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await logger.error({ action: "EXECUTOR_FAILED", error: new Error("boom") });

    const values = valuesSpy.mock.calls[0]![0]!;
    expect(values.newData?.error).toBe("boom");
    expect(values.newData?.stack).toBeUndefined();
  });

  it("un fallo de DB NO rompe el log (fail-safe catch interno)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockImplementation(() => ({
      values: vi.fn(async () => { throw new Error("db down"); }),
    }));

    await expect(logger.security({ action: "X" })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("serializa errores no-Error como string en newData", async () => {
    const valuesSpy = vi.fn(async (_values: {
      action?: string; ipAddress?: string; userAgent?: string; userId?: string;
      newData?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await logger.security({ action: "X", error: "error plano" });
    expect(valuesSpy.mock.calls[0]![0]!.newData?.error).toBe("error plano");
  });

  it("error instanceof Error vs string: usa .message cuando es Error", async () => {
    const valuesSpy = vi.fn(async (_values: {
      action?: string; ipAddress?: string; userAgent?: string; userId?: string;
      newData?: Record<string, unknown>;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await logger.error({ action: "X", error: new Error("mensaje real") });
    expect(valuesSpy.mock.calls[0]![0]!.newData?.error).toBe("mensaje real");
  });
});
