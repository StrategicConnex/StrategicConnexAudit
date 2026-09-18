import { describe, it, expect, vi, beforeEach } from "vitest";

interface TaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { evaluationId: string }) => Promise<{ ok: boolean }>;
}

const executeMitreEvaluation = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  task: vi.fn((config: unknown) => config),
}));

vi.mock("@/server/intelligence/adversary/mitre-eval/mitre-service", () => ({
  executeMitreEvaluation,
}));

import { runMitreEvaluationTask } from "./mitre-evaluation.trigger";

describe("Trigger: mitre-real-evaluation", () => {
  const task = runMitreEvaluationTask as unknown as TaskConfig;

  beforeEach(() => {
    executeMitreEvaluation.mockClear();
    executeMitreEvaluation.mockResolvedValue(undefined);
  });

  it("registra id y política de reintentos", () => {
    expect(task.id).toBe("mitre-real-evaluation");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("delega en executeMitreEvaluation y devuelve ok", async () => {
    await expect(task.run({ evaluationId: "e-1" })).resolves.toEqual({ ok: true });
    expect(executeMitreEvaluation).toHaveBeenCalledWith("e-1");
  });

  it("propaga el error de la evaluación MITRE", async () => {
    executeMitreEvaluation.mockRejectedValueOnce(new Error("mitre boom"));
    await expect(task.run({ evaluationId: "e-1" })).rejects.toThrow("mitre boom");
  });
});
