import { describe, it, expect, vi, beforeEach } from "vitest";

interface TaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { jobId: string }) => Promise<{ ok: boolean; jobId?: string; error?: string; isFallback?: boolean }>;
}

const selectLimit = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const generateSeoReport = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({ task: vi.fn((config: unknown) => config) }));
vi.mock("@/shared/db", () => ({ directDb: { select, update } }));
vi.mock("@/shared/db/schemas", () => ({ aiReportJobs: { id: "id" } }));
vi.mock("@/server/ai/seo-report-service", () => ({ generateSeoReport }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { runAiSeoReport } from "./ai-report.trigger";

const JOB = { id: "j1", projectId: "p1", userId: "u1" };

describe("Trigger: ai-seo-report-generation", () => {
  const task = runAiSeoReport as unknown as TaskConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({ from: selectFrom });
    selectFrom.mockReturnValue({ where: selectWhere });
    selectWhere.mockReturnValue({ limit: selectLimit });
    update.mockReturnValue({ set: updateSet });
    updateSet.mockReturnValue({ where: updateWhere });
    updateWhere.mockResolvedValue(undefined);
    selectLimit.mockResolvedValue([JOB]);
  });

  it("registra id y retry con backoff", () => {
    expect(task.id).toBe("ai-seo-report-generation");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("job inexistente → lanza error", async () => {
    selectLimit.mockResolvedValue([]);
    await expect(task.run({ jobId: "missing" })).rejects.toThrow(/inexistente/);
  });

  it("éxito → marca running y completed y devuelve ok", async () => {
    generateSeoReport.mockResolvedValue({
      ok: true,
      report: { summary: "ok" },
      isFallback: false,
      modelUsed: "gpt-4",
    });

    const result = await task.run({ jobId: "j1" });

    expect(result).toEqual({ ok: true, jobId: "j1", isFallback: false });
    expect(generateSeoReport).toHaveBeenCalledWith("p1", "u1");
    expect(updateSet).toHaveBeenCalledTimes(2);
    expect((updateSet.mock.calls[0]![0] as { status: string }).status).toBe("running");
    expect((updateSet.mock.calls[1]![0] as { status: string }).status).toBe("completed");
  });

  it("resultado no-ok del servicio → marca failed y devuelve error", async () => {
    generateSeoReport.mockResolvedValue({ ok: false, error: "sin cuota" });

    const result = await task.run({ jobId: "j1" });

    expect(result).toEqual({ ok: false, error: "sin cuota" });
    const failedSet = updateSet.mock.calls[1]![0] as { status: string; error: string };
    expect(failedSet.status).toBe("failed");
    expect(failedSet.error).toBe("sin cuota");
  });

  it("excepción del servicio → marca failed y re-lanza", async () => {
    generateSeoReport.mockRejectedValue(new Error("openrouter caído"));

    await expect(task.run({ jobId: "j1" })).rejects.toThrow("openrouter caído");
    const failedSet = updateSet.mock.calls[1]![0] as { status: string; error: string };
    expect(failedSet.status).toBe("failed");
    expect(failedSet.error).toBe("openrouter caído");
  });
});
