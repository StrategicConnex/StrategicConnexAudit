/* ═══════════════════════════════════════════════════════════════════════════
   Benchmarking — Tests de endpoint (TD-03 lote 3)

   Agregados de 30 días bajo RLS (uptime % + latencia media + score medio por
   proyecto) y percentiles del proyecto propio. Verifica:
   - 401 sin sesión; 500 en error de transacción
   - benchmarks (min/max/avg/median/p25/p75/p95/count) y totalProjects
   - yourMetrics + yourPercentile con projectId; null si no existe
   - Casos borde: sin datos → stats a cero; latencia/score nulos
   - scope declarado "own-projects"
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockExecute = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({ execute: (...args: unknown[]) => mockExecute(...args) }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/benchmarking${query}`);
}

// Orden de tx.execute: [uptime agregado por proyecto, score medio por proyecto]
const uptimeRows = [
  { projectId: "p1", up: 90, total: 100, avgLatencyMs: 250.6 },
  { projectId: "p2", up: 80, total: 100, avgLatencyMs: 400.2 },
];
const scoreRows = [
  { projectId: "p1", score: 87.4 },
  { projectId: "p2", score: null },
];

function setupExecutes({
  uptime = uptimeRows,
  scores = scoreRows,
}: {
  uptime?: unknown[];
  scores?: unknown[];
} = {}) {
  mockExecute.mockReset();
  mockExecute.mockResolvedValueOnce({ rows: uptime });
  mockExecute.mockResolvedValueOnce({ rows: scores });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Benchmarking — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    setupExecutes();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("No autorizado");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("200 con benchmarks y métricas del proyecto", async () => {
    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.scope).toBe("own-projects");
    expect(typeof body.benchmarks.computedAt).toBe("string");
    expect(body.benchmarks.totalProjects).toBe(2);

    // uptime: [90, 80] → min 80, max 90, avg 85, mediana 85
    expect(body.benchmarks.uptime).toEqual({
      min: 80,
      max: 90,
      avg: 85,
      median: 85,
      p25: 80,
      p75: 90,
      p95: 90,
      count: 2,
    });
    // latencia: [251, 400] redondeada desde 250.6 / 400.2
    expect(body.benchmarks.latency).toEqual({
      min: 251,
      max: 400,
      avg: 326,
      median: 325.5,
      p25: 251,
      p75: 400,
      p95: 400,
      count: 2,
    });
    // score: solo p1 (p2 es null) → 87 redondeado desde 87.4
    expect(body.benchmarks.healthScore).toEqual({
      min: 87,
      max: 87,
      avg: 87,
      median: 87,
      p25: 87,
      p75: 87,
      p95: 87,
      count: 1,
    });

    expect(body.yourMetrics).toEqual({
      projectId: "p1",
      uptimePercent: 90,
      avgLatencyMs: 251,
      score: 87,
    });
    expect(body.yourPercentile).toEqual({ uptime: 0, latency: 50, score: 0 });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("projectId desconocido → yourMetrics null con percentiles nulos", async () => {
    const res = await GET(getRequest("?projectId=nope") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.yourMetrics).toBeNull();
    expect(body.yourPercentile).toEqual({ uptime: null, latency: null, score: null });
    expect(body.benchmarks.totalProjects).toBe(2);
  });

  it("sin datos → stats a cero y totalProjects 0", async () => {
    setupExecutes({ uptime: [], scores: [] });

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.benchmarks.totalProjects).toBe(0);
    expect(body.benchmarks.uptime).toEqual({
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p25: 0,
      p75: 0,
      p95: 0,
      count: 0,
    });
    expect(body.benchmarks.latency.count).toBe(0);
    expect(body.yourMetrics).toBeNull();
  });

  it("latencia y score nulos → 0 y null sin romper percentiles", async () => {
    setupExecutes({
      uptime: [{ projectId: "p3", up: 10, total: 10, avgLatencyMs: null }],
      scores: [{ projectId: "p3", score: null }],
    });

    const res = await GET(getRequest("?projectId=p3") as never);
    const body = await res.json();

    expect(body.yourMetrics).toEqual({
      projectId: "p3",
      uptimePercent: 100,
      avgLatencyMs: 0,
      score: null,
    });
    expect(body.yourPercentile).toEqual({ uptime: 0, latency: null, score: null });
    expect(body.benchmarks.latency.count).toBe(0);
    expect(body.benchmarks.healthScore.count).toBe(0);
  });

  it("error en la transacción → 500", async () => {
    mockExecute.mockReset();
    mockExecute.mockRejectedValue(new Error("db down"));

    const res = await GET(getRequest() as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error al calcular benchmarks");
  });
});
