import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockAssertProjectAccess = vi.fn();
const mockWithRLS = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (...args: unknown[]) => mockWithRLS(...args),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/shared/db/schemas", () => ({
  forecasts: { projectId: "projectId" },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(path: string): NextRequest {
  const url = `http://localhost:3000/api/forecast${path}`;
  return new NextRequest(new Request(url));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/forecast", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
  });

  it("returns 400 when projectId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Falta projectId");
  });

  it("returns 404 when project access denied", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertProjectAccess.mockResolvedValue({ ok: false });
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("returns mapped forecasts", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([
      {
        metric: "organic_traffic",
        currentValue: "1000",
        predictedValue: "1200",
        horizonDays: 14,
        confidence: "0.85",
        sampleDays: 30,
        metadata: { trend: "up" },
        updatedAt: new Date("2026-09-15"),
      },
      {
        metric: "bounce_rate",
        currentValue: "0.45",
        predictedValue: "0.40",
        horizonDays: 14,
        confidence: "0.72",
        sampleDays: 14,
        metadata: null,
        updatedAt: null,
      },
    ]);

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.forecasts).toHaveLength(2);
    expect(body.forecasts[0].metric).toBe("organic_traffic");
    expect(body.forecasts[0].current).toBe(1000);
    expect(body.forecasts[0].predicted).toBe(1200);
    expect(body.forecasts[0].trend).toBe("up");
    expect(body.forecasts[1].trend).toBe("flat");
    expect(body.forecasts[1].updatedAt).toBeNull();
  });

  it("returns empty forecasts when none exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([]);

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.forecasts).toEqual([]);
  });

  it("returns 500 on internal error", async () => {
    mockGetUser.mockRejectedValue(new Error("DB down"));
    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
  });
});
