import { describe, it, expect, vi } from "vitest";
import {
  dispatchJobs,
  summarizeDispatch,
  DISPATCH_STAGGER_MS,
  type DispatchJob,
} from "./cron-plan";

const TIMESTAMP = new Date("2026-10-06T03:00:00.000Z");

function job(id: string, trigger: DispatchJob["trigger"] = vi.fn(async () => undefined)): DispatchJob {
  return { id, legacyCron: "0 3 * * *", trigger };
}

function deps(overrides: Partial<Parameters<typeof dispatchJobs>[1]> = {}) {
  return {
    timestamp: TIMESTAMP,
    sleep: vi.fn(async () => undefined),
    log: vi.fn(),
    warn: vi.fn(),
    staggerMs: 0,
    ...overrides,
  };
}

describe("cron-plan: dispatchJobs", () => {
  it("encola todos los jobs con el timestamp del dispatcher", async () => {
    const a = vi.fn(async () => undefined);
    const b = vi.fn(async () => undefined);

    const outcomes = await dispatchJobs([job("a", a), job("b", b)], deps());

    expect(outcomes).toEqual([
      { id: "a", dispatched: true },
      { id: "b", dispatched: true },
    ]);
    expect(a).toHaveBeenCalledWith({ timestamp: TIMESTAMP });
    expect(b).toHaveBeenCalledWith({ timestamp: TIMESTAMP });
  });

  it("el primero sale ya; el resto espera el escalón", async () => {
    const order: string[] = [];
    const sleep = vi.fn(async (ms: number) => {
      order.push(`sleep:${ms}`);
    });
    const jobs = [
      job("a", vi.fn(async () => void order.push("a"))),
      job("b", vi.fn(async () => void order.push("b"))),
      job("c", vi.fn(async () => void order.push("c"))),
    ];

    await dispatchJobs(jobs, deps({ sleep, staggerMs: 30_000 }));

    // 3 jobs → 2 esperas, no 3: no se espera antes del primero.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 30_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 30_000);
    expect(order).toEqual(["a", "sleep:30000", "b", "sleep:30000", "c"]);
  });

  it("staggerMs 0 encola todo seguido", async () => {
    const sleep = vi.fn(async () => undefined);
    await dispatchJobs([job("a"), job("b")], deps({ sleep, staggerMs: 0 }));
    expect(sleep).not.toHaveBeenCalled();
  });

  it("un job que falla al encolarse no corta los siguientes", async () => {
    const boom = vi.fn(async () => {
      throw new Error("cuota de la API agotada");
    });
    const last = vi.fn(async () => undefined);
    const warn = vi.fn();

    const outcomes = await dispatchJobs([job("roto", boom), job("sano", last)], deps({ warn }));

    expect(outcomes).toEqual([
      { id: "roto", dispatched: false, error: "cuota de la API agotada" },
      { id: "sano", dispatched: true },
    ]);
    expect(last).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[dispatcher] no se pudo encolar roto: cuota de la API agotada");
  });

  it("un throw que no es Error se reporta como string", async () => {
    const outcomes = await dispatchJobs(
      [job("raro", vi.fn(async () => Promise.reject("se cayó el socket")))],
      deps(),
    );
    expect(outcomes[0]).toEqual({ id: "raro", dispatched: false, error: "se cayó el socket" });
  });

  it("lista vacía → lista vacía, sin esperas", async () => {
    const sleep = vi.fn(async () => undefined);
    expect(await dispatchJobs([], deps({ sleep }))).toEqual([]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("el escalón por defecto son 30 s", () => {
    expect(DISPATCH_STAGGER_MS).toBe(30_000);
  });
});

describe("cron-plan: summarizeDispatch", () => {
  it("cuenta encolados y fallos", () => {
    expect(
      summarizeDispatch([
        { id: "a", dispatched: true },
        { id: "b", dispatched: false, error: "x" },
        { id: "c", dispatched: true },
      ]),
    ).toEqual({ total: 3, dispatched: 2, failed: 1 });
  });

  it("sin jobs → todo a cero", () => {
    expect(summarizeDispatch([])).toEqual({ total: 0, dispatched: 0, failed: 0 });
  });
});
