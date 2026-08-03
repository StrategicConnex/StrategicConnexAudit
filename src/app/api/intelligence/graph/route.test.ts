/* ═══════════════════════════════════════════════════════════════════════════
   /api/intelligence/graph — Tests de auth (VULN-009 fix)
   
   Verifica:
   - 401 sin sesión
   - 200 con sesión y nodeId (mock del grafo se mantiene tras autenticar)
   - 400 sin nodeId
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

import { GET } from "./route";

function req(url: string): Request {
  return new Request(url);
}

describe("Intelligence Graph API — Auth (VULN-009)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("http://localhost:3000/api/intelligence/graph?nodeId=domain_x"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("No autorizado");
  });

  it("GET con sesión pero sin nodeId → 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await GET(req("http://localhost:3000/api/intelligence/graph"));
    expect(res.status).toBe(400);
  });

  it("GET con sesión y nodeId → 200 con mock del grafo", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await GET(req("http://localhost:3000/api/intelligence/graph?nodeId=domain_example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });
});
