import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
vi.mock("@/server/auth/admin", () => ({
  requireAdmin: async () => mockRequireAdmin(),
}));

const mockLimit = vi.fn();
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
vi.mock("@/shared/db", () => ({
  directDb: { select: (...args: unknown[]) => mockSelect(...args) },
}));

vi.mock("@/shared/db/schemas/health", () => ({
  aiHealthLogs: {
    overallStatus: "overall_status",
    modelsHealthy: "models_healthy",
    modelsFailed: "models_failed",
    modelsTotal: "models_total",
    avgLatencyMs: "avg_latency_ms",
    checkedAt: "checked_at",
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/ai/status", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    mockLimit.mockResolvedValue([]);
    GET = (await import("./route")).GET;
  });

  it("401 sin sesión y no consulta métricas", async () => {
    const denied = new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    mockRequireAdmin.mockResolvedValue({ ok: false, response: denied });

    const res = await GET();

    expect(res).toBe(denied);
    expect(res.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("403 para usuario autenticado sin rol admin y no consulta métricas", async () => {
    const denied = new Response(JSON.stringify({ error: "Prohibido" }), { status: 403 });
    mockRequireAdmin.mockResolvedValue({ ok: false, response: denied });

    const res = await GET();

    expect(res).toBe(denied);
    expect(res.status).toBe(403);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("200 con el último chequeo persistido (lectura, sin testear modelos)", async () => {
    const checkedAt = new Date("2026-10-04T15:51:23.000Z");
    mockLimit.mockResolvedValue([
      {
        overallStatus: "degraded",
        modelsHealthy: 2,
        modelsFailed: 3,
        modelsTotal: 5,
        avgLatencyMs: 2299,
        checkedAt,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overallStatus).toBe("degraded");
    expect(body.modelsHealthy).toBe(2);
    expect(body.modelsTotal).toBe(5);
    expect(body.checkedAt).toBe(checkedAt.toISOString());
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("sin filas en la tabla → estado vacío honesto (200, no 500)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modelsHealthy).toBeNull();
    expect(body.overallStatus).toBeNull();
    expect(body.checkedAt).toBeNull();
  });
});
