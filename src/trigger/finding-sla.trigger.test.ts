import { describe, it, expect, vi, beforeEach } from "vitest";

const listOverdueFindings = vi.hoisted(() => vi.fn());
const notifyProjectAdmins = vi.hoisted(() => vi.fn());
const listRecentlyEscalatedFindingIds = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: unknown) => config) },
}));
vi.mock("@/server/intelligence/findings/workflow", () => ({ listOverdueFindings }));
vi.mock("@/server/notifications/emit", () => ({
  notifyProjectAdmins,
  listRecentlyEscalatedFindingIds,
}));

import {
  findingSlaSweep,
  SLA_ESCALATION_LIMIT,
  SLA_ESCALATION_DEDUP_HOURS,
} from "./finding-sla.trigger";

interface ScheduleConfig {
  id: string;
  cron: string;
  retry: { maxAttempts: number };
  run: (payload: { timestamp: Date }) => Promise<{
    success: boolean;
    overdue: number;
    escalated: number;
    notifications: number;
    perProject: Record<string, number>;
    timestamp: string;
  }>;
}

const task = findingSlaSweep as unknown as ScheduleConfig;
const payload = { timestamp: new Date("2026-10-05T05:00:00.000Z") };

function finding(id: string, projectId: string, severity = "high") {
  return {
    id,
    projectId,
    title: `Hallazgo ${id}`,
    severity,
    dueAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listOverdueFindings.mockResolvedValue([]);
  listRecentlyEscalatedFindingIds.mockResolvedValue(new Set<string>());
  notifyProjectAdmins.mockResolvedValue(1);
});

describe("Trigger: finding-sla-sweep", () => {
  it("registra id, cron 05:00 UTC y reintentos", () => {
    expect(task.id).toBe("finding-sla-sweep");
    expect(task.cron).toBe("0 5 * * *");
    expect(task.retry.maxAttempts).toBe(2);
  });

  it("sin vencidos → barrido vacío", async () => {
    const result = await task.run(payload);
    expect(result.overdue).toBe(0);
    expect(result.escalated).toBe(0);
    expect(notifyProjectAdmins).not.toHaveBeenCalled();
    expect(listRecentlyEscalatedFindingIds).toHaveBeenCalledWith(
      "finding_overdue",
      SLA_ESCALATION_DEDUP_HOURS,
    );
  });

  it("escala los vencidos y cuenta por proyecto", async () => {
    listOverdueFindings.mockResolvedValue([
      finding("f1", "p1"),
      finding("f2", "p1"),
      finding("f3", "p2"),
    ]);
    notifyProjectAdmins.mockResolvedValue(2);

    const result = await task.run(payload);
    expect(listOverdueFindings).toHaveBeenCalledWith(SLA_ESCALATION_LIMIT);
    expect(result.escalated).toBe(3);
    expect(result.notifications).toBe(6);
    expect(result.perProject).toEqual({ p1: 2, p2: 1 });
    expect(notifyProjectAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", kind: "finding_overdue" }),
    );
  });

  it("omite los ya escalados en las últimas 24h", async () => {
    listOverdueFindings.mockResolvedValue([finding("f1", "p1"), finding("f2", "p1")]);
    listRecentlyEscalatedFindingIds.mockResolvedValue(new Set(["f1"]));

    const result = await task.run(payload);
    expect(result.overdue).toBe(2);
    expect(result.escalated).toBe(1);
    expect(notifyProjectAdmins).toHaveBeenCalledTimes(1);
    expect(notifyProjectAdmins.mock.calls[0]![0].metadata.findingId).toBe("f2");
  });
});
