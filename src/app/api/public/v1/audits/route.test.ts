/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Audits — Tests de endpoint (TD-03 lote 2)

   Verifica (auth de API key ya cubierta en public-router.test.ts; aquí el
   handler con withPublicApi en passthrough):
   - Sin projectId → 400
   - Sin acceso al proyecto → 404 (sin consultar la BD)
   - Acceso ok → 200 con audits + clamp de limit a [1, 100]
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
      audits: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
  db: {},
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type TestRequest = Request & { apiKeyAuth: { userId: string } };

function createRequest(query = ""): TestRequest {
  const req = new Request(
    `http://localhost:3000/api/public/v1/audits${query}`,
  ) as TestRequest;
  req.apiKeyAuth = { userId: "u-1" };
  return req;
}

const rows = [
  { id: "a1", type: "full", status: "completed", createdAt: new Date() },
  { id: "a2", type: "quick", status: "failed", createdAt: new Date() },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Public v1: Audits — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockFindMany.mockResolvedValue(rows);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("projectId is required");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso denegado → 404 sin consultar audits", async () => {
    mockAssertProjectAccess.mockResolvedValue({ ok: false });

    const res = await GET(createRequest("?projectId=p-deny"));
    expect(res.status).toBe(404);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso ok → 200 con las auditorías del proyecto", async () => {
    const res = await GET(createRequest("?projectId=p1&limit=50"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.audits).toHaveLength(2);
    expect(body.audits[0].id).toBe("a1");
    expect(mockAssertProjectAccess).toHaveBeenCalledWith("u-1", "p1");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("limit > 100 se aclampa a 100", async () => {
    const res = await GET(createRequest("?projectId=p1&limit=9999"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("error de BD → 500 con error interno", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
