/* ═══════════════════════════════════════════════════════════════════════════
   Billing: Entitlements (plan y uso) — Tests de endpoint (TD-03 lote 3)

   Sesión Supabase y servicio de entitlements simulados. Verifica:
   - 200 con los entitlements del usuario autenticado
   - Sin sesión → 401 sin consultar el servicio
   - Fallo del servicio → 500
   - Caso borde: entitlements en cero / vacíos se devuelven tal cual
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockGetEntitlements = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/server/lib/entitlements", () => ({
  getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Billing: Entitlements — GET", () => {
  let GET: typeof import("./route").GET;

  const entitlements = {
    plan: "pro",
    limits: { maxProjects: 10, maxKeywords: 500 },
    used: { projects: 3, keywords: 42 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    mockGetEntitlements.mockResolvedValue(entitlements);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sesión válida → 200 con entitlements", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.entitlements).toEqual(entitlements);
    expect(mockGetEntitlements).toHaveBeenCalledWith("u-1");
  });

  it("sin sesión → 401 sin consultar el servicio", async () => {
    mockUser = null;

    const res = await GET();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(mockGetEntitlements).not.toHaveBeenCalled();
  });

  it("fallo del servicio → 500", async () => {
    mockGetEntitlements.mockRejectedValue(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
  });

  it("entitlements vacíos → se devuelven tal cual", async () => {
    mockGetEntitlements.mockResolvedValue({
      plan: "free",
      limits: { maxProjects: 1 },
      used: { projects: 0, keywords: 0 },
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.entitlements.used).toEqual({ projects: 0, keywords: 0 });
  });
});
