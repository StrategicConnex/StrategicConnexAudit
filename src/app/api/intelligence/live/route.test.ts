/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Live (snapshot de métricas) — Tests de endpoint (TD-03 lote 2)

   Tres snapshots en paralelo bajo RLS: uptime (últimos 5 checks, % 24h),
   findings (GROUP BY severidad) y events. Verifica:
   - 401 sin sesión; 500 en error
   - uptimePercent como fracción, avgLatencyMs redondeado, checks ≤ 5
   - Sin investigationId → findings/events a cero sin ejecutar SQL
   - Sin datos de uptime → uptimePercent null
   - Conteos por severidad y eventos agregados
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockSelect = vi.fn();
const mockExecute = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      select: (...args: unknown[]) => mockSelect(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/live${query}`);
}

function uptimeChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

const uptimeRows = [
  { isUp: true, responseTimeMs: 100, checkedAt: new Date() },
  { isUp: false, responseTimeMs: 200, checkedAt: new Date() },
  { isUp: true, responseTimeMs: null, checkedAt: new Date() },
];

// Orden de tx.execute: [counts, latestFindings, totalEvents, latestEvents]
function setupExecutes({
  counts = [{ severity: "critical", cnt: "2" }, { severity: "high", cnt: "3" }],
  latestFindings = [{ id: "f1", severity: "critical", title: "RCE", created_at: "2026-09-26" }],
  totalEvents = [{ cnt: "7" }],
  latestEvents = [{ id: "e1", event_type: "scan", message: "ok", created_at: "2026-09-26" }],
} = {}) {
  mockExecute.mockReset();
  for (const rows of [counts, latestFindings, totalEvents, latestEvents]) {
    mockExecute.mockResolvedValueOnce({ rows });
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Live — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    mockSelect.mockImplementation(() => uptimeChain(uptimeRows));
    setupExecutes();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("200 con los tres snapshots", async () => {
    const res = await GET(
      getRequest("?projectId=p1&investigationId=inv-1") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.ts).toBe("string");

    // uptime: 2 de 3 arriba → 0.666..., latencia media de 100 y 200 → 150
    expect(body.uptime.checks).toHaveLength(3);
    expect(body.uptime.uptimePercent).toBeCloseTo(2 / 3, 5);
    expect(body.uptime.avgLatencyMs).toBe(150);

    // findings: 2 critical + 3 high
    expect(body.findings).toEqual({
      total: 5,
      critical: 2,
      high: 3,
      latest: [{ id: "f1", severity: "critical", title: "RCE", created_at: "2026-09-26" }],
    });

    // events
    expect(body.events.total).toBe(7);
    expect(body.events.latest).toHaveLength(1);
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("sin investigationId → findings/events a cero sin SQL de hallazgos", async () => {
    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.findings).toEqual({ total: 0, critical: 0, high: 0, latest: [] });
    expect(body.events).toEqual({ total: 0, latest: [] });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("sin checks de uptime → uptimePercent y latencia null", async () => {
    mockSelect.mockImplementation(() => uptimeChain([]));

    const res = await GET(getRequest("?projectId=p1") as never);
    const body = await res.json();
    expect(body.uptime.checks).toHaveLength(0);
    expect(body.uptime.uptimePercent).toBeNull();
    expect(body.uptime.avgLatencyMs).toBeNull();
  });

  it("contadores con severidades ausentes → 0 por defecto", async () => {
    setupExecutes({
      counts: [{ severity: "high", cnt: "4" }],
      totalEvents: [{ cnt: "0" }],
    });

    const res = await GET(
      getRequest("?projectId=p1&investigationId=inv-1") as never,
    );
    const body = await res.json();
    expect(body.findings.total).toBe(4);
    expect(body.findings.critical).toBe(0);
    expect(body.events.total).toBe(0);
  });

  it("error en los snapshots → 500", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error al obtener métricas en vivo");
  });
});
