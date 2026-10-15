/* ═══════════════════════════════════════════════════════════════════════════
   Rate limit distribuido — tests del store postgres (ADR-002 enmienda 15)

   Verifica:
   - resolveRateLimitStore(): override RATE_LIMIT_STORE, producción→postgres,
     fuera de producción→memory.
   - checkRateLimit() con store postgres: éxito y rechazo con la misma
     semántica sliding window que el store en memoria (upsert atómico,
    resultado devuelto en RETURNING ts).
   - Degradación acotada (P2-13 / SA-04): un fallo del store ya NO devuelve
     allowed=true. El límite se sigue aplicando con el store en memoria del
     proceso, más un techo global por instancia, y la entrada en degradado se
     audita con `rate_limit_degraded`. Ver ADR-002 §16.
   - Sweep: la primera comprobación por proceso limpia las filas vencidas.
   - Dispatch: sin override y fuera de producción se usa memoria (las pruebas
     de la suite no deben tocar la BD).
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { executeMock, securityEventMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  securityEventMock: vi.fn(),
}));

vi.mock("@/shared/db", () => ({ directDb: { execute: executeMock } }));

vi.mock("./audit-log", () => ({ logSecurityEvent: securityEventMock }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  runWithRequestContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

import {
  checkRateLimit,
  rateLimitResponse,
  resetRateLimitDegradation,
  resolveRateLimitStore,
  type RateLimitConfig,
} from "./ratelimit";
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
    securityEventMock.mockReset();
    resetRateLimitDegradation();
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
      rows: [
        {
          ts: [
            String(oldest),
            String(now - 40_000),
            String(now - 30_000),
            String(now - 20_000),
            String(now - 10_000),
          ],
        },
      ],
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

  it("P2-13: el store caído ya NO permite todo — degrada a memoria acotada", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    const result = await checkRateLimit("10.0.0.1", CFG);

    // Dentro del presupuesto sigue pasando, pero contado en memoria y con el
    // límite configurado: `remaining` refleja el consumo real (antes era
    // siempre `limit`, porque el fail-open no contaba nada).
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.retryAfter).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
    expect(String(vi.mocked(logger.warn).mock.calls[0]![0])).toContain(
      "degradando a memoria acotada"
    );
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

describe("P2-13 — degradación acotada del store (fail-closed con fallback)", () => {
  /** Sólo cuenta los upserts de ventana: el sweep periódico (una vez por
   *  proceso) ensuciaría los conteos sin aportar nada al caso. */
  const upserts = () =>
    executeMock.mock.calls.filter((c) => wire(c).sql.includes("INSERT INTO rate_limit_windows"))
      .length;

  const degradedEvents = () =>
    securityEventMock.mock.calls.filter((c) => c[0] === "rate_limit_degraded");

  beforeEach(async () => {
    executeMock.mockReset();
    securityEventMock.mockReset();
    resetRateLimitDegradation();
    vi.stubEnv("RATE_LIMIT_STORE", "postgres");
    // Calentar el sweep para que el mock reciba sólo upserts a partir de aquí.
    executeMock.mockResolvedValue({ rows: [{ ts: [] }] });
    await checkRateLimit("warm-sweep", CFG);
    executeMock.mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.info).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetRateLimitDegradation();
  });

  it("(a) store caído: sigue limitando con semántica de memoria", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    const results = [];
    for (let i = 0; i < 6; i++) results.push(await checkRateLimit("fb-limit", CFG));

    expect(results.slice(0, 5).every((r) => r.success)).toBe(true);
    expect(results[5]!.success).toBe(false);
    expect(results[5]!.limit).toBe(5);
    expect(results[5]!.remaining).toBe(0);
    expect(results[5]!.retryAfter).toBeGreaterThan(0);
    // Un único intento contra Postgres: a partir de ahí está en cooldown.
    expect(upserts()).toBe(1);
  });

  it("(b) techo global por instancia agotado → rechazo con identificadores limpios", async () => {
    vi.stubEnv("RATE_LIMIT_FALLBACK_GLOBAL_LIMIT", "3");
    executeMock.mockRejectedValue(new Error("connection refused"));

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(`ceiling-${i}`, CFG));

    expect(results.slice(0, 3).every((r) => r.success)).toBe(true);
    expect(results[3]!.success).toBe(false);
    // Headers intactos: se reporta el límite configurado, no el del techo.
    expect(results[3]!.limit).toBe(5);
    expect(results[3]!.remaining).toBe(0);
    const response = rateLimitResponse(results[3]!);
    expect(response.status).toBe(429);
    expect(response.headers.get("RateLimit-Limit")).toBe("5");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("(c) durante el cooldown no se reintenta Postgres", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    await checkRateLimit("cooldown-a", CFG);
    await checkRateLimit("cooldown-b", CFG);
    await checkRateLimit("cooldown-c", CFG);
    await checkRateLimit("cooldown-d", CFG);

    expect(upserts()).toBe(1);
    expect(securityEventMock).toHaveBeenCalledTimes(1);
  });

  it("(d) cooldown expirado: reintenta Postgres y sale del modo si responde", async () => {
    vi.stubEnv("RATE_LIMIT_DEGRADED_COOLDOWN_MS", "0");
    executeMock.mockRejectedValueOnce(new Error("connection refused"));

    const degraded = await checkRateLimit("recover-a", CFG);
    const recovered = await checkRateLimit("recover-b", CFG);
    const straight = await checkRateLimit("recover-c", CFG);

    expect(degraded.success).toBe(true);
    expect(recovered.success).toBe(true);
    expect(straight.success).toBe(true);
    expect(upserts()).toBe(3);
    expect(String(vi.mocked(logger.info).mock.calls[0]![0])).toContain("Store recuperado");
    // Vuelto a la vía distribuida, ya no quedan eventos de degradación nuevos.
    expect(degradedEvents()).toHaveLength(1);
  });

  it("(e) rate_limit_degraded se emite UNA vez por entrada (dedupe)", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));

    await checkRateLimit("dedupe-a", CFG);
    await checkRateLimit("dedupe-b", CFG);
    await checkRateLimit("dedupe-c", CFG);

    expect(degradedEvents()).toHaveLength(1);
    expect(degradedEvents()[0]![1]).toMatchObject({
      metadata: { prefix: CFG.prefix, consecutiveFailures: 1, cooldownMs: 15_000 },
    });
  });

  it("(f) RATE_LIMIT_STORE=memory no regresiona ni toca el techo global", async () => {
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    vi.stubEnv("RATE_LIMIT_FALLBACK_GLOBAL_LIMIT", "1");
    executeMock.mockRejectedValue(new Error("connection refused"));

    const results = [];
    for (let i = 0; i < 5; i++) results.push(await checkRateLimit(`memory-${i}`, CFG));

    expect(results.every((r) => r.success)).toBe(true);
    expect(upserts()).toBe(0);
    expect(securityEventMock).not.toHaveBeenCalled();
  });

  it("(g) identificador ya bloqueado NO consume el techo global (anti-amplificación)", async () => {
    vi.stubEnv("RATE_LIMIT_FALLBACK_GLOBAL_LIMIT", "3");
    executeMock.mockRejectedValue(new Error("connection refused"));

    // Identificador A agota su propio presupuesto (2) y sigue machacando.
    expect((await checkRateLimit("abuse-a", { ...CFG, limit: 2 })).success).toBe(true);
    expect((await checkRateLimit("abuse-a", { ...CFG, limit: 2 })).success).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit("abuse-a", { ...CFG, limit: 2 })).success).toBe(false);
    }

    // Si los rechazos de A hubieran consumido el techo, B caería ya.
    expect((await checkRateLimit("innocent-b", CFG)).success).toBe(true);
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
