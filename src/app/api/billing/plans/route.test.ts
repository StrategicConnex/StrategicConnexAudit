import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      subscriptionPlans: { findMany: mockFindMany },
    },
  },
}));

describe("GET /api/billing/plans", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns mapped plans sorted by priceMonthly", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "free",
        name: "Free",
        maxProjects: 1,
        maxKeywords: 10,
        maxBacklinkChecks: 5,
        crawlLimitMonthly: 50,
        features: ["basic"],
        priceMonthly: 0,
        priceYearly: 0,
      },
      {
        id: "pro",
        name: "Pro",
        maxProjects: 5,
        maxKeywords: 500,
        maxBacklinkChecks: 100,
        crawlLimitMonthly: 5000,
        features: ["basic", "advanced"],
        priceMonthly: 29,
        priceYearly: 290,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.plans).toHaveLength(2);
    expect(body.plans[0].id).toBe("free");
    expect(body.plans[1].id).toBe("pro");
    expect(body.plans[0].priceMonthly).toBe(0);
    expect(body.plans[1].priceMonthly).toBe(29);
  });

  it("returns 500 on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
  });

  it("returns empty plans array when no plans exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.plans).toEqual([]);
  });
});
