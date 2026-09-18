import { describe, it, expect, vi, beforeEach } from "vitest";

interface TaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { assessmentId: string }) => Promise<{ ok: boolean }>;
}

const executeAssessment = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  task: vi.fn((config: unknown) => config),
}));

vi.mock("@/server/intelligence/adversary/assessment/assessment-service", () => ({
  executeAssessment,
}));

import { runAdversaryAssessment } from "./adversary-assessment.trigger";

describe("Trigger: adversary-real-assessment", () => {
  const task = runAdversaryAssessment as unknown as TaskConfig;

  beforeEach(() => {
    executeAssessment.mockClear();
    executeAssessment.mockResolvedValue(undefined);
  });

  it("registra id y política de reintentos", () => {
    expect(task.id).toBe("adversary-real-assessment");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("delega en executeAssessment y devuelve ok", async () => {
    await expect(task.run({ assessmentId: "a-1" })).resolves.toEqual({ ok: true });
    expect(executeAssessment).toHaveBeenCalledWith("a-1");
  });

  it("propaga el error de la evaluación", async () => {
    executeAssessment.mockRejectedValueOnce(new Error("boom"));
    await expect(task.run({ assessmentId: "a-1" })).rejects.toThrow("boom");
  });
});
