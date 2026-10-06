import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  requireProjectPermission: vi.fn(),
  loadPurpleScore: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/server/analytics/queries", () => ({
  loadPurpleScore: mocks.loadPurpleScore,
}));

function get(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const emptyPurple = {
  current: {
    detectionScore: null,
    missRate: null,
    evaluated: 0,
    exposed: 0,
    protected: 0,
    manualOnly: 0,
    errors: 0,
    runs: 0,
    detected: 0,
    missed: 0,
    runErrors: 0,
    byTechnique: [],
    blindSpots: [],
  },
  previous: {
    detectionScore: null,
    missRate: null,
    evaluated: 0,
    exposed: 0,
    protected: 0,
    manualOnly: 0,
    errors: 0,
    runs: 0,
    detected: 0,
    missed: 0,
    runErrors: 0,
    byTechnique: [],
    blindSpots: [],
  },
  deltaPoints: null,
  direction: "unknown",
  hasPreviousData: false,
};

describe("Purple score — GET /api/portfolio/purple-score", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.loadPurpleScore.mockResolvedValue(emptyPurple);
  });

  it("200 con el score y la cobertura de las 14 tácticas", async () => {
    mocks.loadPurpleScore.mockResolvedValue({
      ...emptyPurple,
      current: {
        ...emptyPurple.current,
        detectionScore: 33.3,
        evaluated: 3,
        exposed: 1,
        protected: 2,
        byTechnique: [
          {
            mitreId: "T1190",
            tactic: "Initial Access",
            techniqueName: "Exploit Public-Facing Application",
            exposed: 1,
            protected: 0,
            manualOnly: 0,
            errors: 0,
            exposureRate: 100,
          },
        ],
        blindSpots: ["T1190"],
      },
      deltaPoints: -12,
      direction: "down",
      hasPreviousData: true,
    });

    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.days).toBe(90);
    expect(body.purple.current.detectionScore).toBe(33.3);
    expect(body.purple.current.blindSpots).toEqual(["T1190"]);
    expect(body.frameworkTactics).toHaveLength(14);
    // Una fila por táctica del framework, aunque no tenga técnicas.
    expect(body.tactics).toHaveLength(14);
    expect(body.tactics.find((t: { tactic: string }) => t.tactic === "Initial Access")).toMatchObject({
      techniques: 1,
      exposed: 1,
    });
    expect(mocks.loadPurpleScore).toHaveBeenCalledWith("user-1", PROJECT_ID, 90);
  });

  it("sin evaluaciones devuelve 200 con el score null (no 0%)", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.purple.current.detectionScore).toBeNull();
    expect(body.purple.deltaPoints).toBeNull();
    expect(body.purple.direction).toBe("unknown");
  });

  it("respeta la ventana en días", async () => {
    await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}&days=30`),
    );
    expect(mocks.loadPurpleScore).toHaveBeenCalledWith("user-1", PROJECT_ID, 30);
  });

  it("sin projectId → 400", async () => {
    const res = await GET(get("http://localhost:3000/api/portfolio/purple-score"));
    expect(res.status).toBe(400);
    expect(mocks.loadPurpleScore).not.toHaveBeenCalled();
  });

  it("días fuera de rango → 400", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}&days=1`),
    );
    expect(res.status).toBe(400);
  });

  it("proyecto no encontrado → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(404);
  });

  it("sin permiso report:view → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(403);
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/purple-score?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(500);
  });
});