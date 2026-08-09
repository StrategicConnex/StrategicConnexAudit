import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock de Redis (fail-open seguro, sin red) ──────────────────────────────
const redisMock = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return 1;
    }),
    incr: vi.fn(async (k: string) => {
      const next = ((store.get(k) as number) ?? 0) + 1;
      store.set(k, next);
      return next;
    }),
  };
});

vi.mock("@/shared/lib/ratelimit", () => ({ redis: redisMock }));

import { RedisCircuitBreaker, CircuitState } from "./circuit-breaker";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("RedisCircuitBreaker — estados CLOSED / OPEN / HALF_OPEN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.store.clear();
  });

  it("getState devuelve CLOSED por defecto", async () => {
    const cb = new RedisCircuitBreaker("test-svc");
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("execute con éxito en CLOSED devuelve el resultado y limpia failures", async () => {
    const cb = new RedisCircuitBreaker("test-svc");
    redisMock.store.set("circuit_breaker:test-svc:failures", 3);
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
    expect(redisMock.store.has("circuit_breaker:test-svc:failures")).toBe(false);
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBeUndefined();
  });

  it("ejecuta el callback solo una vez en éxito", async () => {
    const cb = new RedisCircuitBreaker("test-svc");
    const fn = vi.fn(async () => "ok");
    await cb.execute(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("abre el circuito tras failureThreshold fallos consecutivos", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { failureThreshold: 3, recoveryTimeout: 60000 });
    const failing = async () => { throw new Error("boom"); };

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failing)).rejects.toThrow("boom");
    }
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBe(CircuitState.OPEN);
    expect(redisMock.store.has("circuit_breaker:test-svc:last_failure")).toBe(true);
  });

  it("con fallos bajo el umbral el circuito permanece CLOSED", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { failureThreshold: 5 });
    const failing = async () => { throw new Error("boom"); };
    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failing)).rejects.toThrow("boom");
    }
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("rechaza la llamada mientras el circuito está OPEN (fast-fail)", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { recoveryTimeout: 60000 });
    redisMock.store.set("circuit_breaker:test-svc:state", CircuitState.OPEN);
    redisMock.store.set("circuit_breaker:test-svc:last_failure", Date.now());

    const fn = vi.fn(async () => "no debe ejecutarse");
    await expect(cb.execute(fn)).rejects.toThrow("Circuit is OPEN");
    expect(fn).not.toHaveBeenCalled();
  });

  it("transiciona a HALF_OPEN cuando el recoveryTimeout ya pasó y prueba la función", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { recoveryTimeout: 10 });
    redisMock.store.set("circuit_breaker:test-svc:state", CircuitState.OPEN);
    redisMock.store.set("circuit_breaker:test-svc:last_failure", Date.now() - 5000);

    await sleep(15);
    const fn = vi.fn(async () => "recuperado");
    const result = await cb.execute(fn);

    expect(result).toBe("recuperado");
    expect(fn).toHaveBeenCalledTimes(1);
    // Con successThreshold=2, un solo éxito NO cierra el circuito todavía
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBe(CircuitState.HALF_OPEN);
  });

  it("cierra el circuito tras successThreshold éxitos en HALF_OPEN", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { recoveryTimeout: 10, successThreshold: 2 });
    redisMock.store.set("circuit_breaker:test-svc:state", CircuitState.HALF_OPEN);
    redisMock.store.set("circuit_breaker:test-svc:successes", 1);

    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBe(CircuitState.CLOSED);
    expect(redisMock.store.has("circuit_breaker:test-svc:successes")).toBe(false);
  });

  it("vuelve a OPEN si la función falla en HALF_OPEN (threshold 1)", async () => {
    const cb = new RedisCircuitBreaker("test-svc", { recoveryTimeout: 10, failureThreshold: 1 });
    redisMock.store.set("circuit_breaker:test-svc:state", CircuitState.HALF_OPEN);

    await expect(cb.execute(async () => { throw new Error("aún roto"); })).rejects.toThrow("aún roto");
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBe(CircuitState.OPEN);
  });

  it("fail-open: si Redis lanza, getState devuelve CLOSED y execute sigue funcionando", async () => {
    const cb = new RedisCircuitBreaker("test-svc");
    redisMock.get.mockRejectedValueOnce(new Error("redis down"));

    expect(await cb.getState()).toBe(CircuitState.CLOSED);

    redisMock.get.mockRejectedValueOnce(new Error("redis down"));
    const result = await cb.execute(async () => "datos");
    expect(result).toBe("datos");
  });

  it("reset devuelve el circuito a CLOSED y limpia todas las claves", async () => {
    const cb = new RedisCircuitBreaker("test-svc");
    redisMock.store.set("circuit_breaker:test-svc:state", CircuitState.OPEN);
    redisMock.store.set("circuit_breaker:test-svc:failures", 9);
    redisMock.store.set("circuit_breaker:test-svc:successes", 2);
    redisMock.store.set("circuit_breaker:test-svc:last_failure", Date.now());

    await cb.reset();
    expect(redisMock.store.get("circuit_breaker:test-svc:state")).toBe(CircuitState.CLOSED);
    expect(redisMock.store.has("circuit_breaker:test-svc:failures")).toBe(false);
    expect(redisMock.store.has("circuit_breaker:test-svc:successes")).toBe(false);
    expect(redisMock.store.has("circuit_breaker:test-svc:last_failure")).toBe(false);
  });
});
