/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence Health — Tests de endpoint

   Verifica el handler GET con el health checker simulado:
   - 200 con payload público limitado sin sesión (globalStatus/summary/timestamp)
   - 200 con el reporte completo autenticado (apis incluidas)
   - refresh=true fuerza runAllChecks(); sin refresh solo inicia el monitor
   - 500 cuando el checker o la autenticación fallan
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  runAllChecks: vi.fn(),
  getReport: vi.fn(),
  createClient: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/server/intelligence/core/health-checker", () => ({
  externalApiHealthChecker: {
    start: mocks.start,
    runAllChecks: mocks.runAllChecks,
    getReport: mocks.getReport,
  },
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const report = {
  timestamp: "2026-09-24T00:00:00.000Z",
  globalStatus: "healthy",
  apis: [
    {
      name: "geoip",
      status: "healthy",
      latencyMs: 42,
      lastCheckedAt: "2026-09-24T00:00:00.000Z",
      error: null,
    },
  ],
  summary: { total: 4, healthy: 4, degraded: 0, down: 0, avgLatencyMs: 42 },
};

function setUser(id: string | null): void {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: id ? { id } : null } })),
    },
  });
}

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/intelligence/health${query}`)
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/intelligence/health", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    setUser(null);
    mocks.getReport.mockReturnValue(report);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns limited public payload for anonymous requests", async () => {
    setUser(null);

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.globalStatus).toBe("healthy");
    expect(body.summary).toEqual(report.summary);
    expect(body.timestamp).toBe(report.timestamp);
    expect(body.apis).toBeUndefined();

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.runAllChecks).not.toHaveBeenCalled();
    expect(mocks.getReport).toHaveBeenCalledTimes(1);
  });

  it("returns full report for authenticated users", async () => {
    setUser("user-1");

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.globalStatus).toBe("healthy");
    expect(body.apis).toHaveLength(1);
    expect(body.apis[0].name).toBe("geoip");
    expect(body.summary.total).toBe(4);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.runAllChecks).not.toHaveBeenCalled();
  });

  it("forces an immediate re-check when refresh=true", async () => {
    setUser("user-1");
    mocks.runAllChecks.mockResolvedValue(undefined);

    const res = await GET(createRequest("?refresh=true"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.runAllChecks).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the health checker report fails", async () => {
    setUser("user-1");
    mocks.getReport.mockImplementation(() => {
      throw new Error("checker down");
    });

    const res = await GET(createRequest());
    expect(res.status).toBe(500);
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.globalStatus).toBe("degraded");
    expect(body.error).toBe("Error interno del sistema de monitoreo");
    expect(typeof body.timestamp).toBe("string");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "[HealthAPI] Error fetching health report:",
      { error: "checker down" }
    );
  });

  it("returns 500 when authentication fails", async () => {
    mocks.createClient.mockRejectedValue(new Error("auth boom"));

    const res = await GET(createRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.globalStatus).toBe("degraded");
  });
});
