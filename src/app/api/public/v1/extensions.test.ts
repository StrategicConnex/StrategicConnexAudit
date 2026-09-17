import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertAccess = vi.fn();

vi.mock("@/server/api/public-router", () => ({
  withPublicApi: (handler: (req: unknown) => Promise<Response>) => handler,
  apiError: (error: string, status: number) =>
    new Response(JSON.stringify({ success: false, error }), { status }),
  apiSuccess: (data: unknown) =>
    new Response(JSON.stringify({ success: true, ...(data as Record<string, unknown>) }), {
      status: 200,
    }),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertAccess(...args),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      audits: { findMany: vi.fn(async () => [{ id: "a1", status: "completed" }]) },
      uptimeLogs: { findMany: vi.fn(async () => []) },
      aiReportJobs: {
        findMany: vi.fn(async () => [
          {
            id: "j1",
            status: "completed",
            report: "# R",
            isFallback: false,
            modelUsed: "m",
            createdAt: new Date("2026-01-01"),
          },
        ]),
      },
    },
    select: () => ({
      from: () => ({
        where: async () => [{ total: "10", ups: "9", avgLatency: "120" }],
      }),
    }),
  },
}));

import { NextRequest } from "next/server";

function authed(url: string) {
  const req = new NextRequest(url) as NextRequest & {
    apiKeyAuth: { userId: string };
  };
  req.apiKeyAuth = { userId: "u1" };
  return req;
}

describe("public v1 — audits/uptime/reports (B-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAccess.mockResolvedValue({ ok: true, role: "viewer" });
  });

  it("GET audits → 200 con lista", async () => {
    const { GET } = await import("./audits/route");
    const res = await GET(authed("http://x/api/public/v1/audits?projectId=p1"));
    expect(res.status).toBe(200);
    expect((await res.json()).audits).toHaveLength(1);
  });

  it("GET audits sin projectId → 400", async () => {
    const { GET } = await import("./audits/route");
    const res = await GET(authed("http://x/api/public/v1/audits"));
    expect(res.status).toBe(400);
  });

  it("GET audits sin acceso → 404", async () => {
    mockAssertAccess.mockResolvedValue({ ok: false, role: null });
    const { GET } = await import("./audits/route");
    const res = await GET(authed("http://x/api/public/v1/audits?projectId=p1"));
    expect(res.status).toBe(404);
  });

  it("GET uptime → 200 con agregado", async () => {
    const { GET } = await import("./uptime/route");
    const res = await GET(authed("http://x/api/public/v1/uptime?projectId=p1&days=7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uptimePct).toBe(90);
    expect(body.checks).toEqual([]);
  });

  it("GET reports → 200 solo completados", async () => {
    const { GET } = await import("./reports/route");
    const res = await GET(authed("http://x/api/public/v1/reports?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].report).toBe("# R");
  });
});
