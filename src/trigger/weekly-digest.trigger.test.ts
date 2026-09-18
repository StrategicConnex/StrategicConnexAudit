import { describe, it, expect, vi, beforeEach } from "vitest";

interface ScheduleConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: Date }) => Promise<Record<string, unknown>>;
}

const runWeeklyDigest = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/security/weekly-digest", () => ({ runWeeklyDigest }));

import { weeklyDigestTask } from "./weekly-digest.trigger";

describe("Trigger: weekly-digest", () => {
  const task = weeklyDigestTask as unknown as ScheduleConfig;

  beforeEach(() => {
    runWeeklyDigest.mockReset();
  });

  it("registra id y cron semanal (lunes 09:00 UTC)", () => {
    expect(task.id).toBe("weekly-digest");
    expect(task.cron).toBe("0 9 * * 1");
  });

  it("delega en runWeeklyDigest y añade timestamp ISO", async () => {
    runWeeklyDigest.mockResolvedValue({ projects: 3, sent: 2, failed: 1 });

    const result = await task.run({ timestamp: new Date() });

    expect(runWeeklyDigest).toHaveBeenCalledTimes(1);
    expect(result.projects).toBe(3);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(new Date(result.timestamp as string).toISOString()).toBe(result.timestamp);
  });

  it("propaga el error si el digest falla", async () => {
    runWeeklyDigest.mockRejectedValue(new Error("digest boom"));
    await expect(task.run({ timestamp: new Date() })).rejects.toThrow("digest boom");
  });
});
