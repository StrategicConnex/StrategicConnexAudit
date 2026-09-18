import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryQueue: Array<unknown> = [];

function pushQueryResult(...results: unknown[]) {
  for (const r of results) queryQueue.push(r);
}

function makeChain() {
  const c = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (val: unknown) => void) => {
      resolve(queryQueue.shift() ?? []);
    }),
  };
  return c;
}

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => makeChain(),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", domain: "domain", ownerId: "ownerId", settings: "settings", deletedAt: "deletedAt", isDeleted: "isDeleted", isHidden: "isHidden" },
  uptimeLogs: { projectId: "projectId", checkedAt: "checkedAt", isUp: "isUp" },
  issues: { projectId: "projectId", severity: "severity" },
  anomalyDetections: { projectId: "projectId", detectedAt: "detectedAt" },
  users: { id: "id", email: "email" },
}));

vi.mock("@/server/security/siem-exporter", () => ({
  WEBHOOK_FORMATTERS: [],
  persistDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { digestSeverity, runWeeklyDigest } from "./weekly-digest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  queryQueue.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weekly-digest — severidad (P2-5)", () => {
  it("crítica con issues críticas aunque el uptime sea 100", () => {
    expect(digestSeverity(100, 2)).toBe("critical");
  });

  it("crítica con uptime bajo 95 sin issues", () => {
    expect(digestSeverity(94.9, 0)).toBe("critical");
  });

  it("info con uptime alto y sin issues", () => {
    expect(digestSeverity(99.5, 0)).toBe("info");
  });

  it("info sin datos de uptime ni issues", () => {
    expect(digestSeverity(null, 0)).toBe("info");
  });
});

describe("weekly-digest — runWeeklyDigest", () => {
  it("returns empty results when no active projects", async () => {
    pushQueryResult([]);
    const result = await runWeeklyDigest();
    expect(result.projects).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("processes project with no SIEM channels (only direct delivery)", async () => {
    pushQueryResult([
      { id: "p1", domain: "example.com", ownerEmail: "owner@example.com", settings: {} },
    ]);
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 95 }]);
    pushQueryResult([{ n: 2 }]);
    pushQueryResult([{ n: 1 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.projects).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.domain).toBe("example.com");
    expect(result.results[0]!.uptimePct).toBe(95);
    expect(result.results[0]!.criticalIssues).toBe(2);
    expect(result.results[0]!.anomalies7d).toBe(1);
  });

  it("logs error when project processing fails", async () => {
    pushQueryResult([{
      id: "p-fail",
      domain: "fail.com",
      ownerEmail: null,
      settings: null,
    }]);

    const errorChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        throw new Error("DB crash");
      }),
      then: vi.fn(),
    };
    vi.mocked(errorChain.where).mockImplementation(() => {
      throw new Error("DB crash");
    });

    const result = await runWeeklyDigest();
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("fail.com");
  });

  it("handles project with telegramChatId in settings", async () => {
    pushQueryResult([{
      id: "p2",
      domain: "tg.com",
      ownerEmail: "tg@example.com",
      settings: { telegramChatId: "12345" },
    }]);
    pushQueryResult([{ total: 50 }]);
    pushQueryResult([{ ups: 50 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.domain).toBe("tg.com");
  });

  it("marks project as failed when no SIEM target succeeds", async () => {
    pushQueryResult([{
      id: "p3",
      domain: "nosend.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 10 }]);
    pushQueryResult([{ ups: 10 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.failed).toBe(1);
    expect(result.results[0]!.sent).toBe(false);
  });

  it("handles null ownerEmail and null settings gracefully", async () => {
    pushQueryResult([{
      id: "p4",
      domain: "nulls.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 20 }]);
    pushQueryResult([{ ups: 19 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.emailSent).toBe(false);
    expect(result.results[0]!.telegramSent).toBe(false);
  });

  it("uptimePct is null when total checks is 0", async () => {
    pushQueryResult([{
      id: "p5",
      domain: "empty.com",
      ownerEmail: "e@e.com",
      settings: {},
    }]);
    pushQueryResult([{ total: 0 }]);
    pushQueryResult([{ ups: 0 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn());

    const result = await runWeeklyDigest();
    expect(result.results[0]!.uptimePct).toBeNull();
  });

  it("handles multiple projects", async () => {
    pushQueryResult([
      { id: "p1", domain: "a.com", ownerEmail: "a@a.com", settings: {} },
      { id: "p2", domain: "b.com", ownerEmail: "b@b.com", settings: null },
    ]);
    // p1: 5 queries (total, ups, crit, anom)
    pushQueryResult([{ total: 200 }]);
    pushQueryResult([{ ups: 190 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 3 }]);
    // p2: 4 queries
    pushQueryResult([{ total: 100 }]);
    pushQueryResult([{ ups: 100 }]);
    pushQueryResult([{ n: 1 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await runWeeklyDigest();
    expect(result.projects).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("uses WEBHOOK_FORMATTERS for SIEM channels when configured", async () => {
    const { WEBHOOK_FORMATTERS } = await import("@/server/security/siem-exporter");
    const mockFormatter = {
      name: "TestSlack",
      envVar: "SIEM_WEBHOOK_TEST",
      formatter: vi.fn().mockReturnValue({ url: "https://hooks.test.com", headers: {}, body: {} }),
    };
    (WEBHOOK_FORMATTERS as unknown[]).push(mockFormatter);

    vi.stubEnv("SIEM_WEBHOOK_TEST", "https://hooks.test.com");

    pushQueryResult([{
      id: "p6",
      domain: "siem.com",
      ownerEmail: null,
      settings: null,
    }]);
    pushQueryResult([{ total: 50 }]);
    pushQueryResult([{ ups: 50 }]);
    pushQueryResult([{ n: 0 }]);
    pushQueryResult([{ n: 0 }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    try {
      const result = await runWeeklyDigest();
      expect(result.results).toHaveLength(1);
    } finally {
      const idx = (WEBHOOK_FORMATTERS as unknown[]).indexOf(mockFormatter);
      if (idx >= 0) (WEBHOOK_FORMATTERS as unknown[]).splice(idx, 1);
    }
  });
});
