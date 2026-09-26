/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: History — Tests de endpoint (TD-03 lote 2)

   withRateLimit en passthrough (inyecta userId); withRLS + readers DNS/WHOIS/
   orchestrator mockeados. Verifica:
   - Sin projectId → 400; proyecto no accesible → 404 (control de acceso RLS,
     porque los readers usan directDb)
   - type=all → dns + whois; type=dns → solo dns; type=whois → solo whois
   - type=timeline con/sin query → timeline / null
   - Error → 500 con mensaje
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();
const mockQueryDns = vi.fn();
const mockQueryWhois = vi.fn();
const mockTimeline = vi.fn();

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (
    _opts: unknown,
    handler: (req: Request, userId: string) => Promise<Response>,
  ) => (req: Request) => handler(req, "u-1"),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: { projects: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
    }),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/server/intelligence/history/dns-history", () => ({
  queryDnsHistory: (...args: unknown[]) => mockQueryDns(...args),
}));

vi.mock("@/server/intelligence/history/whois-history", () => ({
  queryWhoisHistory: (...args: unknown[]) => mockQueryWhois(...args),
}));

vi.mock("@/server/intelligence/history/orchestrator", () => ({
  getProjectHistoryTimeline: (...args: unknown[]) => mockTimeline(...args),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/history${query}`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: History — GET", () => {
  let GET: typeof import("./route").GET;

  const dnsPayload = { records: [{ type: "A", value: "1.2.3.4" }], total: 1 };
  const whoisPayload = { snapshots: [{ registrar: "ACME" }], total: 1 };
  const timelinePayload = { events: [{ date: "2026-01-01", kind: "dns" }] };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({ id: "p1" });
    mockQueryDns.mockResolvedValue(dnsPayload);
    mockQueryWhois.mockResolvedValue(whoisPayload);
    mockTimeline.mockResolvedValue(timelinePayload);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest() as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("projectId es requerido");
    expect(mockQueryDns).not.toHaveBeenCalled();
  });

  it("proyecto inexistente/denegado → 404 sin consultar readers", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await GET(createRequest("?projectId=p-deny") as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado o acceso denegado");
    expect(mockQueryDns).not.toHaveBeenCalled();
    expect(mockQueryWhois).not.toHaveBeenCalled();
  });

  it("type=all (default) → consulta dns y whois", async () => {
    const res = await GET(createRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      type: "all",
      projectId: "p1",
      dns: dnsPayload,
      whois: whoisPayload,
      timeline: null,
    });
    expect(mockQueryDns).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", limit: 50, offset: 0 }),
    );
    expect(mockQueryWhois).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1" }),
    );
    expect(mockTimeline).not.toHaveBeenCalled();
  });

  it("type=dns → solo consulta DNS con filtros", async () => {
    const res = await GET(
      createRequest("?projectId=p1&type=dns&query=example.com&recordType=A&limit=10") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.dns).toEqual(dnsPayload);
    expect(body.whois).toBeNull();
    expect(mockQueryDns).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "example.com",
        recordType: "A",
        limit: 10,
      }),
    );
    expect(mockQueryWhois).not.toHaveBeenCalled();
  });

  it("type=whois → solo consulta WHOIS (query → domain)", async () => {
    const res = await GET(
      createRequest("?projectId=p1&type=whois&query=example.com") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.whois).toEqual(whoisPayload);
    expect(body.dns).toBeNull();
    expect(mockQueryWhois).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "example.com" }),
    );
    expect(mockQueryDns).not.toHaveBeenCalled();
  });

  it("type=timeline con query → llama al orquestador", async () => {
    const res = await GET(
      createRequest("?projectId=p1&type=timeline&query=example.com") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.timeline).toEqual(timelinePayload);
    expect(mockTimeline).toHaveBeenCalledWith("p1", "example.com");
    expect(mockQueryDns).not.toHaveBeenCalled();
    expect(mockQueryWhois).not.toHaveBeenCalled();
  });

  it("type=timeline sin query → timeline null (no llama al orquestador)", async () => {
    const res = await GET(
      createRequest("?projectId=p1&type=timeline") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.timeline).toBeNull();
    expect(mockTimeline).not.toHaveBeenCalled();
  });

  it("error inesperado → 500 con mensaje", async () => {
    mockQueryDns.mockRejectedValue(new Error("boom"));

    const res = await GET(createRequest("?projectId=p1&type=dns") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error al consultar historial: boom");
  });
});
