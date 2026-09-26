/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Reports — Tests de endpoint (TD-03 lote 2)

   Verifica (auth de API key en public-router.test.ts; handler en passthrough):
   - Sin projectId → 400; sin acceso → 404
   - Solo reportes `completed` y mapeo {id, report, isFallback, modelUsed,
     createdAt ISO|null} (el entregable que Zapier/Make consume)
   - Error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAssertProjectAccess = vi.fn();
const mockFindMany = vi.fn();

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
    query: {
      aiReportJobs: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
  db: {},
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type TestRequest = Request & { apiKeyAuth: { userId: string } };

function createRequest(query = ""): TestRequest {
  const req = new Request(
    `http://localhost:3000/api/public/v1/reports${query}`,
  ) as TestRequest;
  req.apiKeyAuth = { userId: "u-1" };
  return req;
}

const createdAt = new Date("2026-09-26T10:00:00.000Z");

const jobRows = [
  { id: "j1", status: "completed", report: { title: "OK" }, isFallback: false, modelUsed: "m1", createdAt },
  { id: "j2", status: "running", report: null, isFallback: false, modelUsed: null, createdAt },
  { id: "j3", status: "completed", report: { title: "FB" }, isFallback: true, modelUsed: "m2", createdAt: null },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Public v1: Reports — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockFindMany.mockResolvedValue(jobRows);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso denegado → 404", async () => {
    mockAssertProjectAccess.mockResolvedValue({ ok: false });

    const res = await GET(createRequest("?projectId=p-deny"));
    expect(res.status).toBe(404);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("solo filtra completed y normaliza createdAt a ISO/null", async () => {
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reports).toHaveLength(2);

    expect(body.reports[0]).toEqual({
      id: "j1",
      report: { title: "OK" },
      isFallback: false,
      modelUsed: "m1",
      createdAt: "2026-09-26T10:00:00.000Z",
    });
    expect(body.reports[1].createdAt).toBeNull();
    expect(body.reports.map((r: { id: string }) => r.id)).not.toContain("j2");
  });

  it("consulta siempre con limit 5 (últimos jobs)", async () => {
    await GET(createRequest("?projectId=p1"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });

  it("error de BD → 500", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
