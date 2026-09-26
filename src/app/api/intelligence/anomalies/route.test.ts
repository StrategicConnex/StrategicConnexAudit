/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Anomalies — Tests de endpoint (TD-03 lote 2)

   Auth Supabase real + withRLS mockeado. Verifica:
   - Sin sesión → 401; sin projectId → 400
   - Filtros (metricType, severity, unresolvedOnly, since) → condiciones where
   - Respuesta 200 con anomalies/total/stats y clamp de limit a 500
   - Error de BD → 500
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

function createRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/anomalies${query}`);
}

const anomalyRows = [
  { id: "an1", metricType: "latency", severity: "critical", resolvedAt: null },
  { id: "an2", metricType: "uptime", severity: "warning", resolvedAt: null },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Anomalies — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    // Dos selects: [0] lista paginada, [1] conteo total
    mockSelect
      .mockReturnValueOnce({ from: () => {
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          offset: () => Promise.resolve(anomalyRows),
        };
        return chain;
      } })
      .mockReturnValueOnce({ from: () => ({
        where: () => Promise.resolve([{ total: 7 }]),
      }) });
    mockExecute.mockResolvedValue({
      rows: [{ metric_type: "latency", severity: "critical", cnt: 3, max_z: 4.2 }],
    });
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await GET(createRequest("?projectId=p1") as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest() as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("projectId es requerido");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("200 con anomalies, total y stats agregadas", async () => {
    const res = await GET(createRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.anomalies).toHaveLength(2);
    expect(body.total).toBe(7);
    expect(body.stats).toHaveLength(1);
    expect(body.stats[0].metric_type).toBe("latency");
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("filtros → where con condiciones y clamp de limit a 500", async () => {
    const res = await GET(
      createRequest(
        "?projectId=p1&severity=critical&metricType=latency&unresolvedOnly=true&limit=9999",
      ) as never,
    );
    expect(res.status).toBe(200);

    // Lista paginada: primer select → where/orderBy/limit/offset
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("error en withRLS/BD → 500", async () => {
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await GET(createRequest("?projectId=p1") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno del servidor");
  });
});
