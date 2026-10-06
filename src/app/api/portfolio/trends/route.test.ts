import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  requireProjectPermission: vi.fn(),
  loadTrends: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/server/analytics/queries", () => ({
  loadTrends: mocks.loadTrends,
}));

function get(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const emptyTrends = {
  bucket: "week",
  points: [],
  uptime: [],
  latestScore: null,
  scoreDelta: null,
  direction: "unknown",
  resolvedInWindow: 0,
  stillOpen: 0,
  uptimePct: null,
  coverage: { buckets: 0, withScore: 0, withUptime: 0 },
};

describe("Trends — GET /api/portfolio/trends", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.loadTrends.mockResolvedValue(emptyTrends);
  });

  it("200 con la serie y los parámetros de ventana", async () => {
    mocks.loadTrends.mockResolvedValue({ ...emptyTrends, latestScore: 85, direction: "up" });

    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}&bucket=week&window=8`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.bucket).toBe("week");
    expect(body.window).toBe(8);
    expect(body.trends.latestScore).toBe(85);
    expect(mocks.loadTrends).toHaveBeenCalledWith("user-1", "week", 8);
  });

  it("aplica los defaults (week / 12) si no vienen", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    expect(mocks.loadTrends).toHaveBeenCalledWith("user-1", "week", 12);
  });

  it("sin datos devuelve 200 con la serie vacía, no 404", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trends.points).toEqual([]);
    expect(body.trends.latestScore).toBeNull();
  });

  it("sin projectId → 400", async () => {
    const res = await GET(get("http://localhost:3000/api/portfolio/trends"));
    expect(res.status).toBe(400);
    expect(mocks.loadTrends).not.toHaveBeenCalled();
  });

  it("projectId no UUID → 400", async () => {
    const res = await GET(
      get("http://localhost:3000/api/portfolio/trends?projectId=nope"),
    );
    expect(res.status).toBe(400);
  });

  it("bucket inválido → 400", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}&bucket=hour`),
    );
    expect(res.status).toBe(400);
  });

  it("window fuera de rango → 400", async () => {
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}&window=9999`),
    );
    expect(res.status).toBe(400);
  });

  it("proyecto no encontrado → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(404);
  });

  it("sin permiso report:view → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(403);
    expect(mocks.loadTrends).not.toHaveBeenCalled();
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(
      get(`http://localhost:3000/api/portfolio/trends?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(500);
  });
});