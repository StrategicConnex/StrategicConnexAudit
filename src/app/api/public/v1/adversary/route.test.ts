/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Adversary — Tests de endpoint (Tanda 4 / B13)

   Cubre: faltantes de projectId, acceso denegado, forma de la respuesta
   (runs con MITRE del escenario + assessments) y el contrato de honestidad:
   un run sin veredicto devuelve `result: null`, no un falso "missed".
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertProjectAccess = vi.fn();
const mockRunsResult = vi.fn();
const mockAssessmentsFindMany = vi.fn();

function runsChain() {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          orderBy: () => ({ limit: mockRunsResult }),
        }),
      }),
    }),
  };
}

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
    select: () => runsChain(),
    query: {
      adversaryAssessments: { findMany: (...args: unknown[]) => mockAssessmentsFindMany(...args) },
    },
  },
  db: {},
}));

vi.mock("@/shared/db/schemas", () => ({
  adversaryRuns: {
    id: "runs.id",
    projectId: "runs.projectId",
    scenarioId: "runs.scenarioId",
    status: "runs.status",
    result: "runs.result",
    detectedBy: "runs.detectedBy",
    completedAt: "runs.completedAt",
    createdAt: "runs.createdAt",
  },
  adversaryScenarios: { id: "scenarios.id", mitreId: "scenarios.mitreId", name: "scenarios.name" },
  adversaryAssessments: {
    projectId: "assessments.projectId",
    createdAt: "assessments.createdAt",
  },
}));

type TestRequest = Request & { apiKeyAuth: { userId: string } };

function createRequest(query = ""): TestRequest {
  const req = new Request(
    `http://localhost:3000/api/public/v1/adversary${query}`,
  ) as TestRequest;
  req.apiKeyAuth = { userId: "u-1" };
  return req;
}

const runs = [
  {
    id: "run-1",
    status: "completed",
    result: "missed",
    detectedBy: null,
    mitreId: "T1190",
    scenarioName: "Explotar app expuesta",
    completedAt: new Date("2026-10-02T12:00:00.000Z"),
  },
  {
    id: "run-2",
    status: "pending",
    result: null, // sin veredicto todavía
    detectedBy: null,
    mitreId: null,
    scenarioName: null,
    completedAt: null,
  },
];

const assessments = [
  {
    id: "as-1",
    status: "completed",
    target: "acme.com",
    riskScore: 62,
    summary: "Superficie expuesta moderada",
    completedAt: new Date("2026-10-01T09:00:00.000Z"),
  },
];

describe("Public v1: Adversary — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockRunsResult.mockResolvedValue(runs);
    mockAssessmentsFindMany.mockResolvedValue(assessments);
    ({ GET } = await import("./route"));
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    expect(mockRunsResult).not.toHaveBeenCalled();
  });

  it("acceso denegado → 404 sin consultar runs", async () => {
    mockAssertProjectAccess.mockResolvedValue({ ok: false });
    const res = await GET(createRequest("?projectId=p-deny"));
    expect(res.status).toBe(404);
    expect(mockRunsResult).not.toHaveBeenCalled();
  });

  it("acceso ok → 200 con runs (MITRE del escenario) y assessments", async () => {
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]).toEqual({
      id: "run-1",
      status: "completed",
      result: "missed",
      detectedBy: null,
      mitreId: "T1190",
      scenarioName: "Explotar app expuesta",
      completedAt: "2026-10-02T12:00:00.000Z",
    });
    expect(body.assessments[0]).toMatchObject({
      id: "as-1",
      riskScore: 62,
      target: "acme.com",
    });
  });

  it("run sin veredicto → result null (no se disfraza de 'missed')", async () => {
    const res = await GET(createRequest("?projectId=p1"));
    const body = await res.json();
    expect(body.runs[1].result).toBeNull();
    expect(body.runs[1].completedAt).toBeNull();
  });

  it("limit se aclampa a [1, 200]", async () => {
    await GET(createRequest("?projectId=p1&limit=5000"));
    expect(mockRunsResult).toHaveBeenCalledWith(200);
    await GET(createRequest("?projectId=p1&limit=-3"));
    expect(mockRunsResult).toHaveBeenLastCalledWith(1);
  });

  it("error de BD → 500", async () => {
    mockRunsResult.mockRejectedValue(new Error("db down"));
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
  });
});
