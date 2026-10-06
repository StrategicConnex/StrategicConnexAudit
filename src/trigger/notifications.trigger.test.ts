import { describe, it, expect, vi, beforeEach } from "vitest";
import { DISPATCH_OWNER } from "./cron-plan";

const purgeOldNotifications = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: unknown) => config),
}));
vi.mock("@/server/notifications/emit", () => ({ purgeOldNotifications }));

import { notificationsMaintenance, NOTIFICATION_RETENTION_DAYS } from "./notifications.trigger";

interface ScheduleConfig {
  id: string;
  cron?: string;
  retry: { maxAttempts: number };
  run: (payload: { timestamp: Date }) => Promise<{
    success: boolean;
    purged: number;
    retentionDays: number;
    timestamp: string;
  }>;
}

const task = notificationsMaintenance as unknown as ScheduleConfig;
const payload = { timestamp: new Date("2026-10-05T03:00:00.000Z") };

beforeEach(() => {
  vi.clearAllMocks();
  purgeOldNotifications.mockResolvedValue(0);
});

describe("Trigger: notifications-maintenance", () => {
  it("registra id sin cron propio y reintentos", () => {
    expect(task.id).toBe("notifications-maintenance");
    expect(task.cron).toBeUndefined();
    expect(DISPATCH_OWNER["notifications-maintenance"]).toBe("daily-operations-dispatcher");
    expect(task.retry.maxAttempts).toBe(2);
  });

  it("purga con la retención de 90 días", async () => {
    purgeOldNotifications.mockResolvedValue(17);
    const result = await task.run(payload);
    expect(purgeOldNotifications).toHaveBeenCalledWith(NOTIFICATION_RETENTION_DAYS);
    expect(result).toEqual({
      success: true,
      purged: 17,
      retentionDays: 90,
      timestamp: "2026-10-05T03:00:00.000Z",
    });
  });

  it("sin filas → purged 0", async () => {
    const result = await task.run(payload);
    expect(result.purged).toBe(0);
  });
});
