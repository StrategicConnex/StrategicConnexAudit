/* ═══════════════════════════════════════════════════════════════════════════
   Rate limit distribuido — tests del store postgres (ADR-002 enmienda 15)

   Verifica:
   - resolveRateLimitStore(): override RATE_LIMIT_STORE, producción→postgres,
     fuera de producción→memory.
   - checkRateLimit() con store postgres: éxito y rechazo con la misma
     semántica sliding window que el store en memoria (upsert atómico,
    resultado devuelto en RETURNING ts).
   - Fail-open: cualquier fallo del store devuelve allowed=true (ADR-002) y
     deja constancia en logger.error.
   - Sweep: la primera comprobación por proceso limpia las filas vencidas.
   - Dispatch: sin override y fuera de producción se usa memoria (las pruebas
     de la suite no deben tocar la BD).
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock("@/shared/db", () => ({ directDb: { execute: executeMock } }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  runWithRequestContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

import { checkRateLimit, resolveRateLimitStore, type RateLimitConfig } from "./ratelimit";
import { logger } from "@/lib/logger";
import { PgDialect } from "drizzle-orm/pg-core";

const CFG: RateLimitConfig = { limit: 5, window: 60, prefix: "test_pg" };

const dialect = new PgDialect();

/**
 * Query wire final de una llamada a execute (SQL con `$n` + params), igual
 * que lo que viaja a PostgreSQL: permite probar que los valores se atan como
 * parámetros y no se concatenan en el SQL.
 */
function wire(call: unknown[]): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(call[0] as Parameters<typeof dialect.sqlToQuery>[0]);
}

describe("resolveRateLimitStore", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("default fuera de producción → memory", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(resolveRateLimitStore()).toBe("memory");
  });

  it("NODE_ENV=production sin override → postgres", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveRateLimitStore()).toBe("postgres");
  });

  it("RATE_LIMIT_STORE=postgres fuerza postgres fuera de producción", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RATE_LIMIT_STORE", "postgres");
    expect(resolveRateLimitStore()).toBe("postgres");
  });

  it("RATE_LIMIT_STORE=memory es override de emergencia en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    expect(resolveRateLimitStore()).toBe("memory");
  });

  it("valores desconocidos de RATE_LIMIT_STORE se ignoran", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_STORE", "redis");
    expect(resolveRateLimitStore()).toBe("postgres");
  });
});

describe("checkRateLimit con store postgres", () => {
  beforeEach(() => {
    executeMock.mockReset();
    vi.stubEnv("RATE_LIMIT_STORE", "postgres");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("primera comprobación del proceso: sweep de filas vencidas + upsert", async () => {
    executeMock.mockResolvedValue({ rows: [{ ts: [String(Date.now())] }] });

    const result = await checkRateLimit("1.2.3.4", CFG);

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(wire(executeMock.mock.calls[0]!).sql).toContain("DELETE FROM rate_limit_windows");
    expect(wire(executeMock.mock.calls[1]!).sql).toContain("INSERT INTO rate_limit_windows");
    expect(wire(executeMock.mock.calls[1]!).sql).toContain("ON CONFLICT");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.retryAfter).toBe(0);
  });

  it("ventana llena (5 ts devueltos) → rechazo con reset = ts más antiguo + ventana", async () => {
    const now = Date.now();
    const oldest = now - 59_000;
    executeMock.mockResolvedValue({
      rows: [{ ts: [String(oldest), String(now - 40_000), String(now - 30_000), String(now - 20_000), String(now - 10_000)] }],
    });

    const result = await checkRateLimit("1.2.3.4", CFG);

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reset).toBe(oldest + 60_000);
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("ts vacíos → success con presupuesto completo", async () => {
    executeMock.mockResolvedValue({ rows: [{ ts: [] }] });

    const result = await checkRateLimit("5.6.7.8", CFG);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
  });

  it("ts como strings (int8 de node-pg) se parsean y ordenan", async () => {
    const now = Date.now();
    executeMock.mockResolvedValue({ rows: [{ ts: [String(now), String(now - 1_000)] }] });

    const result = await checkRateLimit("9.9.9.9", CFG);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it("fail-open: el store caído devuelve allowed=true y loguea el error", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    const result = await checkRateLimit("10.0.0.1", CFG);

    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(5);
    expect(result.retryAfter).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(logger.error).mock.calls[0]![0])).toContain("fail-open");
  });

  it("el identificador viaja como parámetro (no interpolado en el SQL)", async () => {
    executeMock.mockResolvedValue({ rows: [{ ts: [] }] });

    await checkRateLimit("evil'); DROP TABLE users;--", CFG);

    const w = wire(executeMock.mock.calls[0]!);
    expect(w.sql).not.toContain("DROP TABLE");
    expect(w.sql).toContain("INSERT INTO rate_limit_windows");
    expect(w.params).toContain("evil'); DROP TABLE users;--");
  });
});

describe("dispatch del store", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sin override y fuera de producción → memoria (sin tocar la BD)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    executeMock.mockReset();

    const result = await checkRateLimit("2001:db8::1", CFG);

    expect(executeMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });
});
