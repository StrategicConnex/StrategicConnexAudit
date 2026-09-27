import { describe, it, expect, vi, beforeEach } from "vitest";

import { CircuitBreaker, CircuitState, resetAllCircuits } from "./circuit-breaker";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cada test usa un servicio distinto: el estado vive en memoria de módulo
let svcSeq = 0;
const svc = () => `test-svc-${++svcSeq}`;

const failing = async () => {
  throw new Error("boom");
};

describe("CircuitBreaker — estados CLOSED / OPEN / HALF_OPEN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuits();
  });

  it("getState devuelve CLOSED por defecto", async () => {
    const cb = new CircuitBreaker(svc());
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("execute con éxito en CLOSED devuelve el resultado", async () => {
    const cb = new CircuitBreaker(svc());
    expect(await cb.execute(async () => 42)).toBe(42);
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("ejecuta el callback solo una vez en éxito", async () => {
    const cb = new CircuitBreaker(svc());
    const fn = vi.fn(async () => "ok");
    await cb.execute(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("un éxito en CLOSED limpia el contador de fallos acumulados", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 3 });

    await expect(cb.execute(failing)).rejects.toThrow("boom");
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    expect(await cb.getState()).toBe(CircuitState.CLOSED);

    // El éxito reinicia failures: los 2 fallos anteriores no cuentan ya
    await cb.execute(async () => "recuperado");
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    expect(await cb.getState()).toBe(CircuitState.CLOSED);

    // El fallo 3 (desde cero) sí abre el circuito
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    expect(await cb.getState()).toBe(CircuitState.OPEN);
  });

  it("abre el circuito tras failureThreshold fallos consecutivos", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 3, recoveryTimeout: 60000 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failing)).rejects.toThrow("boom");
    }
    expect(await cb.getState()).toBe(CircuitState.OPEN);
  });

  it("con fallos bajo el umbral el circuito permanece CLOSED", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 5 });

    for (let i = 0; i < 2; i++) {
      await expect(cb.execute(failing)).rejects.toThrow("boom");
    }
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("rechaza la llamada mientras el circuito está OPEN (fast-fail)", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 1, recoveryTimeout: 60000 });
    await expect(cb.execute(failing)).rejects.toThrow("boom");

    const fn = vi.fn(async () => "no debe ejecutarse");
    await expect(cb.execute(fn)).rejects.toThrow("Circuit is OPEN");
    expect(fn).not.toHaveBeenCalled();
  });

  it("transiciona a HALF_OPEN cuando el recoveryTimeout ya pasó y prueba la función", async () => {
    const cb = new CircuitBreaker(svc(), {
      failureThreshold: 1,
      recoveryTimeout: 10,
      successThreshold: 2,
    });
    await expect(cb.execute(failing)).rejects.toThrow("boom");

    await sleep(20);
    const fn = vi.fn(async () => "recuperado");
    const result = await cb.execute(fn);

    expect(result).toBe("recuperado");
    expect(fn).toHaveBeenCalledTimes(1);
    // Con successThreshold=2, un solo éxito NO cierra el circuito todavía
    expect(await cb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it("cierra el circuito tras successThreshold éxitos en HALF_OPEN", async () => {
    const cb = new CircuitBreaker(svc(), {
      failureThreshold: 1,
      recoveryTimeout: 10,
      successThreshold: 2,
    });
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    await sleep(20);

    expect(await cb.execute(async () => "ok-1")).toBe("ok-1");
    expect(await cb.getState()).toBe(CircuitState.HALF_OPEN);

    expect(await cb.execute(async () => "ok-2")).toBe("ok-2");
    expect(await cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("vuelve a OPEN si la función falla en HALF_OPEN", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 1, recoveryTimeout: 10 });
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    await sleep(20);

    // Entramos en HALF_OPEN con una llamada que falla → de nuevo OPEN
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    expect(await cb.getState()).toBe(CircuitState.OPEN);

    const fn = vi.fn(async () => "no debe ejecutarse");
    await expect(cb.execute(fn)).rejects.toThrow("Circuit is OPEN");
    expect(fn).not.toHaveBeenCalled();
  });

  it("reset devuelve el circuito a CLOSED", async () => {
    const cb = new CircuitBreaker(svc(), { failureThreshold: 1, recoveryTimeout: 60000 });
    await expect(cb.execute(failing)).rejects.toThrow("boom");
    expect(await cb.getState()).toBe(CircuitState.OPEN);

    await cb.reset();

    expect(await cb.getState()).toBe(CircuitState.CLOSED);
    expect(await cb.execute(async () => "ok")).toBe("ok");
  });
});
