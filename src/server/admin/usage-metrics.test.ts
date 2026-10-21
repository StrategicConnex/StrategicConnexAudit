import { describe, it, expect } from "vitest";
import { reduceUsageMetrics } from "./usage-metrics";

describe("reduceUsageMetrics", () => {
  it("agrega counts y reparte findings por severidad", () => {
    const m = reduceUsageMetrics({
      totalUsers: 12,
      totalProjects: 8,
      auditsLast30d: 33,
      findingsLast30d: [
        { severity: "critical", n: 4 },
        { severity: "high", n: 7 },
        { severity: "medium", n: 2 },
        { severity: "low", n: 1 },
      ],
      activeUsersLast7d: 5,
      aiLast30d: { calls: 120, tokensIn: 9000, tokensOut: 3000, costUsd: 0.42, cacheHits: 40 },
    });

    expect(m).toEqual({
      totalUsers: 12,
      totalProjects: 8,
      auditsLast30d: 33,
      findingsLast30d: 14,
      findingsBySeverity: { critical: 4, high: 7, medium: 2, low: 1 },
      activeUsersLast7d: 5,
      aiCallsLast30d: 120,
      aiTokensLast30d: { in: 9000, out: 3000 },
      aiCostUsdLast30d: 0.42,
      aiCacheHitsLast30d: { hits: 40, total: 120 },
    });
  });

  it("zeros defensivos para valores nulos", () => {
    expect(reduceUsageMetrics({
      totalUsers: 0,
      totalProjects: 0,
      auditsLast30d: 0,
      findingsLast30d: [],
      activeUsersLast7d: 0,
      aiLast30d: { calls: 0, tokensIn: null, tokensOut: null, costUsd: null, cacheHits: 0 },
    })).toMatchObject({
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      aiTokensLast30d: { in: 0, out: 0 },
      aiCostUsdLast30d: 0,
      aiCacheHitsLast30d: { hits: 0, total: 0 },
    });
  });
});
