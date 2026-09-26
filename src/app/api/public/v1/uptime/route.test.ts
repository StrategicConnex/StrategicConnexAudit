/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Uptime — Tests de endpoint (TD-03 lote 2)

   Verifica (auth de API key en public-router.test.ts; handler en passthrough):
   - Sin projectId → 400; sin acceso → 404
   - Agregado (uptimePct redondeado a 1 decimal, avgLatencyMs, checks ISO)
   - Casos borde: total 0 → uptimePct null; avgLatency null → null
   - days aclampado a [1, 90]; error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAssertProjectAccess = vi.fn();
const mockFindMany = vi.fn();
const mockSelectChain = vi.fn();

vi.mock("@/server/api/public-router", () => ({
  withPublicApi: (handler: unknown) => handler,
  apiError: (error: string, status = 400) =>
    Response.json({ success: false, error }, { status }),
  apiSuccess: (data: Record<string, unknown>, status = 200) =>
    Response.json({ success: true, ...data }, { status }),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          mockSelectChain().then(resolve, reject),
      };
      return chain;
    },
    query: {
      uptimeLogs: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
  db: {},
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type TestRequest = Request & { apiKeyAuth: { userId: string } };

function createRequest(query = ""): TestRequest {
  const req = new Request(
    `http://localhost:3000/api/public/v1/uptime${query}`,
  ) as TestRequest;
  req.apiKeyAuth = { userId: "u-1" };
  return req;
}

const aggRows = [{ total: 20, ups: 19, avgLatency: 123.456 }];
const checks = [
  { isUp: true, statusCode: 200, responseTimeMs: 120, checkedAt: new Date("2026-09-26T08:00:00.000Z") },
  { isUp: false, statusCode: 503, responseTimeMs: null, checkedAt: undefined },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Public v1: Uptime — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockSelectChain.mockResolvedValue(aggRows);
    mockFindMany.mockResolvedValue(checks);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    expect(mockSelectChain).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso denegado → 404 sin consultar la BD", async () => {
    mockAssertProjectAccess.mockResolvedValue({ ok: false });

    const res = await GET(createRequest("?projectId=p-deny"));
    expect(res.status).toBe(404);
    expect(mockSelectChain).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("200 con uptimePct (1 decimal), latencia redondeada y checks ISO", async () => {
    const res = await GET(createRequest("?projectId=p1&days=30"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.uptimePct).toBe(95); // 19/20 = 95%
    expect(body.avgLatencyMs).toBe(123); // Math.round(123.456)
    expect(body.checks).toHaveLength(2);
    expect(body.checks[0].checkedAt).toBe("2026-09-26T08:00:00.000Z");
    expect(body.checks[1].checkedAt).toBeNull(); // checkedAt undefined
    expect(mockAssertProjectAccess).toHaveBeenCalledWith("u-1", "p1");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("total 0 → uptimePct null (sin divisiones por cero)", async () => {
    mockSelectChain.mockResolvedValue([]);

    const res = await GET(createRequest("?projectId=p1"));
    const body = await res.json();
    expect(body.uptimePct).toBeNull();
    expect(body.avgLatencyMs).toBeNull();
    expect(body.checks).toHaveLength(2);
  });

  it("avgLatency null en la BD → avgLatencyMs null", async () => {
    mockSelectChain.mockResolvedValue([{ total: 5, ups: 5, avgLatency: null }]);

    const res = await GET(createRequest("?projectId=p1"));
    const body = await res.json();
    expect(body.avgLatencyMs).toBeNull();
    expect(body.uptimePct).toBe(100);
  });

  it("days > 90 se aclampa a 90 y days < 1 a 1", async () => {
    await GET(createRequest("?projectId=p1&days=999"));
    await GET(createRequest("?projectId=p1&days=-5"));

    // Ambas llamadas usan la ventana aclampada (since = ahora - days)
    expect(mockSelectChain).toHaveBeenCalledTimes(2);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it("error de BD → 500", async () => {
    mockSelectChain.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
