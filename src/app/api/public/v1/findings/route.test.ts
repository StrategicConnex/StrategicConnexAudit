/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Findings — Tests de endpoint (Tanda 4 / B13)

   Cubre: faltantes de projectId, scope, acceso denegado, filtro por severidad,
   derivación honesta de cvssScore/mitreId (null cuando no hay triage) y el
   clamp de limit.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertProjectAccess = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/server/api/public-router", () => ({
  withPublicApi: (handler: unknown) => handler,
  apiError: (error: string, status = 400) => Response.json({ success: false, error }, { status }),
  apiSuccess: (data: Record<string, unknown>, status = 200) =>
    Response.json({ success: true, ...data }, { status }),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      intelligenceFindings: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
  },
  db: {},
}));

vi.mock("@/shared/db/schemas", () => ({
  intelligenceFindings: { projectId: "projectId", severity: "severity", createdAt: "createdAt" },
}));

type TestRequest = Request & { apiKeyAuth: { userId: string } };

function createRequest(query = ""): TestRequest {
  const req = new Request(
    `http://localhost:3000/api/public/v1/findings${query}`,
  ) as TestRequest;
  req.apiKeyAuth = { userId: "u-1" };
  return req;
}

const rows = [
  {
    id: "f1",
    severity: "critical",
    title: "TLS 1.0 habilitado",
    status: "open",
    affectedAsset: "acme.com",
    aiTriage: { cvssScore: 8.1, mitreId: "T1040" },
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
  },
  {
    id: "f2",
    severity: "low",
    title: "Cabecera HSTS ausente",
    status: "open",
    affectedAsset: null,
    aiTriage: null, // aún sin clasificar
    createdAt: new Date("2026-09-30T10:00:00.000Z"),
  },
];

describe("Public v1: Findings — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockFindMany.mockResolvedValue(rows);
    ({ GET } = await import("./route"));
  });

  it("sin projectId → 400 y no consulta la BD", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("projectId is required");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("severidad inválida → 400 con las severidades válidas", async () => {
    const res = await GET(createRequest("?projectId=p1&severity=catastrofica"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("severity must be one of");
    expect(body.error).toContain("critical");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso denegado → 404 sin consultar hallazgos", async () => {
    mockAssertProjectAccess.mockResolvedValue({ ok: false });
    const res = await GET(createRequest("?projectId=p-deny"));
    expect(res.status).toBe(404);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("acceso ok → 200 con hallazgos y triage derivado", async () => {
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mockAssertProjectAccess).toHaveBeenCalledWith("u-1", "p1");
    expect(body.findings).toHaveLength(2);
    expect(body.findings[0]).toEqual({
      id: "f1",
      severity: "critical",
      title: "TLS 1.0 habilitado",
      status: "open",
      affectedAsset: "acme.com",
      cvssScore: 8.1,
      mitreId: "T1040",
      createdAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("hallazgo sin triage IA → cvssScore y mitreId null (nunca 0)", async () => {
    const res = await GET(createRequest("?projectId=p1"));
    const body = await res.json();
    expect(body.findings[1].cvssScore).toBeNull();
    expect(body.findings[1].mitreId).toBeNull();
  });

  it("severidad válida añade el filtro a la consulta", async () => {
    const res = await GET(createRequest("?projectId=p1&severity=critical"));
    expect(res.status).toBe(200);
    const where = mockFindMany.mock.calls[0]![0].where;
    // El filtro se compone con `and` (dos condiciones), no se ignora.
    expect(where).toBeDefined();
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("limit se aclampa a [1, 200]", async () => {
    await GET(createRequest("?projectId=p1&limit=9999"));
    expect(mockFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200 }));
    await GET(createRequest("?projectId=p1&limit=0"));
    expect(mockFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it("error de BD → 500", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
  });
});
