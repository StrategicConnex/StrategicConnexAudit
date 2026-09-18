import { describe, it, expect, vi, beforeEach } from "vitest";

interface ScheduleConfig {
  id: string;
  cron: string;
  run: () => Promise<{
    success: boolean;
    uptimeDeleted: number;
    vitalsDeleted: number;
    heatmapDeleted: number;
    secAuditDeleted: number;
  }>;
}

const delWhere = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
}));

vi.mock("@/shared/db", () => ({ db: { delete: del } }));

vi.mock("@/shared/db/schemas", () => ({
  uptimeLogs: { checkedAt: "checkedAt" },
  webVitalsLogs: { recordedAt: "recordedAt" },
  heatmapSessions: { recordedAt: "recordedAt" },
  securityAuditLogs: { createdAt: "createdAt" },
}));

vi.mock("drizzle-orm", () => ({ lt: vi.fn(() => ({})) }));

import { cleanupOldLogs } from "./cleanup.trigger";

describe("Trigger: cleanup-old-logs", () => {
  const task = cleanupOldLogs as unknown as ScheduleConfig;

  beforeEach(() => {
    del.mockReset();
    delWhere.mockReset();
    del.mockImplementation(() => ({ where: delWhere }));
    delWhere.mockResolvedValue({ rowCount: 7 });
  });

  it("registra id y cron de medianoche", () => {
    expect(task.id).toBe("cleanup-old-logs");
    expect(task.cron).toBe("0 0 * * *");
  });

  it("purga las 4 tablas y devuelve los rowCount", async () => {
    const result = await task.run();

    expect(del).toHaveBeenCalledTimes(4);
    expect(delWhere).toHaveBeenCalledTimes(4);
    expect(result.success).toBe(true);
    expect(result.uptimeDeleted).toBe(7);
    expect(result.vitalsDeleted).toBe(7);
    expect(result.heatmapDeleted).toBe(7);
    expect(result.secAuditDeleted).toBe(7);
  });

  it("si una purga falla → propaga el error", async () => {
    delWhere.mockRejectedValue(new Error("purge boom"));
    await expect(task.run()).rejects.toThrow("purge boom");
  });
});
