import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  loadPortfolio: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/analytics/queries", () => ({
  loadPortfolio: mocks.loadPortfolio,
}));

function get(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

const emptyPortfolio = {
  corporateScore: null,
  projectCount: 0,
  projectsWithoutData: 0,
  totalCriticalIssues: 0,
  totalWarningIssues: 0,
  totalOpenFindings: 0,
  totalOpenCritical: 0,
  mttrHours: null,
  worstProjects: [],
  projects: [],
  openBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
};

describe("Portfolio — GET /api/portfolio", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
    mocks.loadPortfolio.mockResolvedValue(emptyPortfolio);
  });

  it("200 con el roll-up y el registro de tácticas del framework", async () => {
    mocks.loadPortfolio.mockResolvedValue({
      ...emptyPortfolio,
      corporateScore: 85,
      projectCount: 2,
    });

    const res = await GET(get("http://localhost:3000/api/portfolio"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.portfolio.corporateScore).toBe(85);
    expect(body.frameworkTactics).toHaveLength(14);
    expect(body.frameworkTactics.map((t: { name: string }) => t.name)).toContain("Exfiltration");
  });

  it("pasa el id del usuario autenticado a la carga", async () => {
    await GET(get("http://localhost:3000/api/portfolio"));
    expect(mocks.loadPortfolio).toHaveBeenCalledWith("user-1");
  });

  it("cartera vacía devuelve 200 con score null (no 0)", async () => {
    const res = await GET(get("http://localhost:3000/api/portfolio"));
    const body = await res.json();
    expect(body.portfolio.corporateScore).toBeNull();
    expect(body.portfolio.worstProjects).toEqual([]);
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(get("http://localhost:3000/api/portfolio"));
    expect(res.status).toBe(500);
  });

  it("fallo de base de datos → 500 sin filtrar detalles", async () => {
    mocks.loadPortfolio.mockRejectedValue(new Error("connection refused"));
    const res = await GET(get("http://localhost:3000/api/portfolio"));
    expect(res.status).toBe(500);
  });
});