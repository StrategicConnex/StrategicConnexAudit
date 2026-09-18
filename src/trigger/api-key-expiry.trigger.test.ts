import { describe, it, expect, vi, beforeEach } from "vitest";

interface ScheduleConfig {
  id: string;
  cron: string;
  run: () => Promise<{
    success: boolean;
    expiringKeysFound: number;
    alertsSent: number;
    alertsFailed: number;
    keys?: unknown[];
    errors?: string[];
  }>;
}

const runApiKeyExpiryCheck = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk/v3", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/security/api-key-expiry-alert", () => ({ runApiKeyExpiryCheck }));

import { apiKeyExpiryAlert } from "./api-key-expiry.trigger";

describe("Trigger: api-key-expiry-alert", () => {
  const task = apiKeyExpiryAlert as unknown as ScheduleConfig;

  beforeEach(() => {
    runApiKeyExpiryCheck.mockReset();
  });

  const base = { expiringKeysFound: 0, alertsSent: 0, alertsFailed: 0, keys: [], errors: [] as string[] };

  it("registra id y cron diario", () => {
    expect(task.id).toBe("api-key-expiry-alert");
    expect(task.cron).toBe("0 9 * * *");
  });

  it("sin claves próximas a expirar → success y sin keys", async () => {
    runApiKeyExpiryCheck.mockResolvedValue({ ...base });

    const result = await task.run();

    expect(result.success).toBe(true);
    expect(result.expiringKeysFound).toBe(0);
    expect(result.keys).toBeUndefined();
    expect(result.errors).toBeUndefined();
  });

  it("con claves y alertas enviadas → devuelve contadores y keys", async () => {
    runApiKeyExpiryCheck.mockResolvedValue({
      ...base,
      expiringKeysFound: 2,
      alertsSent: 2,
      keys: [{ keyName: "CI", keyPrefix: "sa_live", daysRemaining: 3 }],
    });

    const result = await task.run();

    expect(result.success).toBe(true);
    expect(result.expiringKeysFound).toBe(2);
    expect(result.alertsSent).toBe(2);
    expect(result.keys).toHaveLength(1);
  });

  it("con errores parciales → success false y errors presentes", async () => {
    runApiKeyExpiryCheck.mockResolvedValue({ ...base, errors: ["slack timeout"] });

    const result = await task.run();

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(["slack timeout"]);
  });
});
