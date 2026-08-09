import { describe, it, expect, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError, geoipCircuit, whoisCircuit, premiumApiCircuit } from "./circuit-breaker";

describe("CircuitBreaker (core servidor) — estados y transiciones", () => {
  it("CLOSED por defecto con stats coherentes", () => {
    const cb = new CircuitBreaker({ name: "test" });
    expect(cb.currentState).toBe("CLOSED");
    expect(cb.stats.totalRequests).toBe(0);
    expect(cb.stats.rejectedRequests).toBe(0);
  });

  it("execute exitoso en CLOSED resetea failures", async () => {
    const cb = new CircuitBreaker({ name: "test" });
    const fail = async () => { throw new Error("x"); };
    for (let i = 0; i < 2; i++) await cb.execute(fail).catch(() => {});
    expect(cb.stats.failures).toBe(2);

    const ok = await cb.execute(async () => "bien");
    expect(ok).toBe("bien");
    expect(cb.stats.failures).toBe(0);
    expect(cb.stats.totalRequests).toBe(3);
  });

  it("abre el circuito tras failureThreshold fallos y lanza CircuitOpenError", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3, resetTimeoutMs: 60000 });
    const fail = async () => { throw new Error("boom"); };
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {});

    expect(cb.currentState).toBe("OPEN");
    await expect(cb.execute(async () => "nunca")).rejects.toBeInstanceOf(CircuitOpenError);
    expect(cb.stats.rejectedRequests).toBe(1);
  });

  it("CircuitOpenError expone circuitName y retryAfterMs", async () => {
    const cb = new CircuitBreaker({ name: "geo", failureThreshold: 1, resetTimeoutMs: 5000 });
    await cb.execute(async () => { throw new Error("x"); }).catch(() => {});
    try {
      await cb.execute(async () => "x");
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitOpenError);
      expect((e as CircuitOpenError).circuitName).toBe("geo");
      expect((e as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
      expect((e as CircuitOpenError).retryAfterMs).toBeLessThanOrEqual(5000);
    }
  });

  it("transiciona OPEN → HALF_OPEN tras resetTimeoutMs (vía currentState)", async () => {
    vi.useFakeTimers();
    try {
      const cb = new CircuitBreaker({ name: "test", failureThreshold: 1, resetTimeoutMs: 1000 });
      await cb.execute(async () => { throw new Error("x"); }).catch(() => {});
      expect(cb.currentState).toBe("OPEN");
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe("HALF_OPEN");
    } finally {
      vi.useRealTimers();
    }
  });

  it("HALF_OPEN: un fallo vuelve a OPEN; successThreshold éxitos cierran", async () => {
    vi.useFakeTimers();
    try {
      const cb = new CircuitBreaker({ name: "test", failureThreshold: 2, resetTimeoutMs: 1000, successThreshold: 2 });
      for (let i = 0; i < 2; i++) await cb.execute(async () => { throw new Error("x"); }).catch(() => {});
      expect(cb.currentState).toBe("OPEN");
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe("HALF_OPEN");

      await cb.execute(async () => "ok1");
      expect(cb.currentState).toBe("HALF_OPEN");
      await cb.execute(async () => "ok2");
      expect(cb.currentState).toBe("CLOSED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("HALF_OPEN con fallo vuelve a OPEN", async () => {
    vi.useFakeTimers();
    try {
      const cb = new CircuitBreaker({ name: "test", failureThreshold: 1, resetTimeoutMs: 1000 });
      await cb.execute(async () => { throw new Error("x"); }).catch(() => {});
      expect(cb.currentState).toBe("OPEN");
      vi.advanceTimersByTime(1001);
      expect(cb.currentState).toBe("HALF_OPEN");
      await cb.execute(async () => { throw new Error("aún roto"); }).catch(() => {});
      expect(cb.currentState).toBe("OPEN");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reset manual vuelve a CLOSED y limpia métricas", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 1 });
    await cb.execute(async () => { throw new Error("x"); }).catch(() => {});
    expect(cb.currentState).toBe("OPEN");
    cb.reset();
    expect(cb.currentState).toBe("CLOSED");
    expect(cb.stats.failures).toBe(0);
    expect(cb.stats.successes).toBe(0);
    expect(cb.stats.openedAt).toBeNull();
  });

  it("un CircuitOpenError lanzado por la función NO se cuenta como fallo nuevo", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 5, resetTimeoutMs: 1000 });
    await cb.execute(async () => { throw new CircuitOpenError("ya abierto", "test", 100); }).catch(() => {});
    expect(cb.stats.failures).toBe(0);
  });

  it("las instancias globales existen con configuraciones por API", () => {
    expect(geoipCircuit).toBeInstanceOf(CircuitBreaker);
    expect(whoisCircuit).toBeInstanceOf(CircuitBreaker);
    expect(premiumApiCircuit).toBeInstanceOf(CircuitBreaker);
    expect(geoipCircuit.stats.state).toBe("CLOSED");
  });
});
