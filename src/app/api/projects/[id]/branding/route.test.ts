/* ================================================================
   Projects/[id]/branding — Tests de endpoint (TD-03 lote 3)

   GET de la marca blanca del proyecto (B-4). Verifica:
   - 401 sin sesión; 404 si el usuario no es miembro del proyecto
   - 200 con shape { success, branding, telegramChatId, myRole }
   - Sin fila o sin settings → branding {} y telegramChatId null
   - 500 si getProjectRole o withRLS fallan (error de BD/servicio)
   ================================================================ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==== Mocks ====

const mockGetUser = vi.fn();
const mockGetProjectRole = vi.fn(
  async (_u: string, _p: string): Promise<string | null> => "owner"
);
const mockWithRLS = vi.fn(
  async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)
);

const db = {
  rows: [] as Array<{ settings: unknown }>,
};

const mockTx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => db.rows),
      })),
    })),
  })),
};

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/server/lib/project-access", () => ({
  getProjectRole: (userId: string, projectId: string) =>
    mockGetProjectRole(userId, projectId),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    mockWithRLS(userId, cb),
}));

// ==== Helpers ====

const authed = { data: { user: { id: "u-1" } } };

function req(url: string) {
  return new Request(url);
}

const params = { params: Promise.resolve({ id: "p1" }) };

describe("projects/[id]/branding API — GET marca blanca (B-4)", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(authed);
    mockGetProjectRole.mockResolvedValue("owner");
    db.rows = [];
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(401);
    expect(mockGetProjectRole).not.toHaveBeenCalled();
  });

  it("sin membresía → 404", async () => {
    mockGetProjectRole.mockResolvedValue(null);
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(404);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("miembro lee branding → 200 con myRole", async () => {
    db.rows = [
      {
        settings: {
          branding: { logoUrl: "/logo.png", primaryColor: "#112233" },
          telegramChatId: "-100123",
        },
      },
    ];
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      branding: { logoUrl: "/logo.png", primaryColor: "#112233" },
      telegramChatId: "-100123",
      myRole: "owner",
    });
    expect(mockWithRLS).toHaveBeenCalledWith("u-1", expect.any(Function));
  });

  it("sin fila settings → defaults vacíos", async () => {
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      branding: {},
      telegramChatId: null,
      myRole: "owner",
    });
  });

  it("settings sin branding → objeto vacío", async () => {
    db.rows = [{ settings: { telegramChatId: "42" } }];
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      branding: {},
      telegramChatId: "42",
    });
  });

  it("getProjectRole falla → 500", async () => {
    mockGetProjectRole.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error interno");
  });

  it("withRLS falla → 500", async () => {
    mockWithRLS.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("http://x/api/projects/p1/branding"), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error interno");
  });
});
