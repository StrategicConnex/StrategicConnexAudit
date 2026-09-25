import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

interface EvalSummary {
  model: string;
  okCalls: number;
  avgScore: number;
}

interface ChainProposal {
  taskType: string;
  current: string[];
  proposed: string[];
  reasons: string[];
}

interface TaskConfig {
  id: string;
  maxDuration: number;
  run: (payload: { model?: string; all?: boolean; maxCases?: number }) => Promise<{
    promptVersionSeries: string;
    summary: EvalSummary[];
  }>;
}

interface ScheduleConfig {
  id: string;
  cron: string;
  maxDuration: number;
  run: (payload: { timestamp: Date }) => Promise<{
    evaluated: string[];
    summary: EvalSummary[];
    chainProposal: ChainProposal;
  }>;
}

const EVAL_MODELS = vi.hoisted(() => [
  "model-a",
  "model-b",
  "model-c",
  "model-d",
  "model-e",
]);
const runModelEval = vi.hoisted(() => vi.fn());
const proposeAdversaryChain = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: unknown) => config),
  schedules: { task: vi.fn((config: unknown) => config) },
}));
vi.mock("@/server/ai/eval-runner", () => ({
  runModelEval,
  proposeAdversaryChain,
  EVAL_MODELS,
}));

import { evalPool, evalPoolWeekly } from "./eval-weekly.trigger";

const WEEK_MS = 7 * 86_400_000;

const CHAIN: ChainProposal = {
  taskType: "adversary-analysis",
  current: ["model-a", "model-b"],
  proposed: ["model-a", "model-b"],
  reasons: [],
};

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  runModelEval.mockResolvedValue({ okCalls: 5, avgScore: 92 });
  proposeAdversaryChain.mockResolvedValue(CHAIN);
});

describe("Trigger: eval-pool", () => {
  const task = evalPool as unknown as TaskConfig;

  it("registra id y maxDuration", () => {
    expect(task.id).toBe("eval-pool");
    expect(task.maxDuration).toBe(900);
  });

  it("all: true → evalúa todo el pool y devuelve el resumen", async () => {
    const result = await task.run({ all: true });

    expect(runModelEval).toHaveBeenCalledTimes(EVAL_MODELS.length);
    expect(runModelEval.mock.calls.map((c: unknown[]) => c[0])).toEqual(EVAL_MODELS);
    expect(result.promptVersionSeries).toBe("ver ai_eval_results");
    expect(result.summary).toEqual(
      EVAL_MODELS.map((m) => ({ model: m, okCalls: 5, avgScore: 92 }))
    );
  });

  it("model puntual → solo evalúa ese modelo", async () => {
    const result = await task.run({ model: "model-c" });

    expect(runModelEval).toHaveBeenCalledTimes(1);
    expect(runModelEval).toHaveBeenCalledWith("model-c", { cases: undefined });
    expect(result.summary).toEqual([{ model: "model-c", okCalls: 5, avgScore: 92 }]);
  });

  it("payload vacío → evalúa todo el pool (all implícito)", async () => {
    await task.run({});

    expect(runModelEval).toHaveBeenCalledTimes(EVAL_MODELS.length);
  });

  it("maxCases no acota en el runner → el runner recibe sin cases", async () => {
    await task.run({ model: "model-a", maxCases: 5 });

    expect(runModelEval).toHaveBeenCalledWith("model-a", { cases: undefined });
  });

  it("fallo del runner → propaga el error sin seguir el pool", async () => {
    runModelEval.mockRejectedValue(new Error("sin cuota"));

    await expect(task.run({ all: true })).rejects.toThrow("sin cuota");
    expect(runModelEval).toHaveBeenCalledTimes(1);
    expect(proposeAdversaryChain).not.toHaveBeenCalled();
  });
});

describe("Trigger: eval-pool-weekly", () => {
  const task = evalPoolWeekly as unknown as ScheduleConfig;

  it("registra id, cron dominical 06:00 UTC y maxDuration", () => {
    expect(task.id).toBe("eval-pool-weekly");
    expect(task.cron).toBe("0 6 * * 0");
    expect(task.maxDuration).toBe(1800);
  });

  it("evalúa el subconjunto rotado y propone cadena con guardrail", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // semana 0 → offset 0
    try {
      const result = await task.run({ timestamp: new Date() });

      expect(result.evaluated).toEqual(["model-a", "model-b"]);
      expect(runModelEval).toHaveBeenCalledTimes(2);
      expect(runModelEval).toHaveBeenNthCalledWith(1, "model-a");
      expect(runModelEval).toHaveBeenNthCalledWith(2, "model-b");
      expect(result.summary).toEqual([
        { model: "model-a", okCalls: 5, avgScore: 92 },
        { model: "model-b", okCalls: 5, avgScore: 92 },
      ]);
      expect(proposeAdversaryChain).toHaveBeenCalledTimes(1);
      expect(proposeAdversaryChain).toHaveBeenCalledWith({ minRuns: 10, days: 45 });
      expect(result.chainProposal).toEqual(CHAIN);
      expect(logSpy).toHaveBeenCalledWith(
        "[eval-weekly] modelos evaluados:",
        expect.any(Array)
      );
      expect(logSpy).toHaveBeenCalledWith(
        "[eval-weekly] propuesta de cadena:",
        expect.any(String)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("semana siguiente → rota a un subconjunto distinto del pool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WEEK_MS); // semana 1 → offset 2
    try {
      const result = await task.run({ timestamp: new Date() });

      expect(result.evaluated).toEqual(["model-c", "model-d"]);
      expect(runModelEval).toHaveBeenCalledTimes(2);
      expect(runModelEval.mock.calls.map((c: unknown[]) => c[0])).toEqual([
        "model-c",
        "model-d",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fallo del runner → propaga y no propone cadena", async () => {
    runModelEval.mockRejectedValue(new Error("modelo caído"));

    await expect(task.run({ timestamp: new Date() })).rejects.toThrow("modelo caído");
    expect(proposeAdversaryChain).not.toHaveBeenCalled();
  });
});
