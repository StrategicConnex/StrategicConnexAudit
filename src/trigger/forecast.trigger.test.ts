import { describe, it, expect, vi, beforeEach } from "vitest";

interface ScheduleConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: Date }) => Promise<{
    processed: number;
    successCount: number;
    errorCount: number;
  }>;
}

const state = vi.hoisted(() => ({ projectRows: [] as unknown[] }));
const execute = vi.hoisted(() => vi.fn());
const insertOnConflict = vi.hoisted(() => vi.fn(async () => {}));
const insertValues = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());
const selectWhere = vi.hoisted(() => vi.fn());
const selectFrom = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const linearForecast = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
}));

vi.mock("@/shared/db", () => ({ db: { select, insert, execute } }));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", domain: "domain", deletedAt: "deletedAt", isDeleted: "isDeleted", isHidden: "isHidden" },
  forecasts: { projectId: "projectId", metric: "metric", updatedAt: "updatedAt" },
}));

vi.mock("@/server/intelligence/anomaly/forecast-math", () => ({ linearForecast }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => ({})),
}));

import { forecastTask } from "./forecast.trigger";

describe("Trigger: weekly-forecast", () => {
  const task = forecastTask as unknown as ScheduleConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    state.projectRows = [];
    select.mockReturnValue({ from: selectFrom });
    selectFrom.mockReturnValue({ where: selectWhere });
    selectWhere.mockImplementation(async () => state.projectRows);
    insert.mockReturnValue({ values: insertValues });
    insertValues.mockReturnValue({ onConflictDoUpdate: insertOnConflict });
    execute.mockResolvedValue({ rows: [{ day: "2026-01-01", avg: "10" }] });
    linearForecast.mockReturnValue({
      current: 10,
      predicted: 12,
      rSquared: 0.81,
      sampleDays: 1,
      trend: "up",
      slopePerDay: 0.5,
    });
  });

  it("registra id y cron semanal (lunes 06:00 UTC)", () => {
    expect(task.id).toBe("weekly-forecast");
    expect(task.cron).toBe("0 6 * * 1");
  });

  it("sin proyectos activos → processed 0", async () => {
    const result = await task.run({ timestamp: new Date() });
    expect(result).toEqual({ processed: 0, successCount: 0, errorCount: 0, timestamp: expect.any(String) });
    expect(insert).not.toHaveBeenCalled();
  });

  it("un proyecto → 3 métricas insertadas con upsert", async () => {
    state.projectRows = [{ id: "p1", domain: "example.com" }];

    const result = await task.run({ timestamp: new Date() });

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(insert).toHaveBeenCalledTimes(3);
    expect(insertOnConflict).toHaveBeenCalledTimes(3);
    expect(linearForecast).toHaveBeenCalledTimes(3);
  });

  it("error de BD en un proyecto → se cuenta como error", async () => {
    state.projectRows = [{ id: "p1", domain: "example.com" }];
    execute.mockRejectedValue(new Error("db down"));

    const result = await task.run({ timestamp: new Date() });

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(insert).not.toHaveBeenCalled();
  });
});
