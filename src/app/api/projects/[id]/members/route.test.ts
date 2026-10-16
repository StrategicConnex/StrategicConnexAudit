import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetProjectRole = vi.fn(async (_u: string, _p: string): Promise<string | null> => "owner");
const mockCreateInvitation = vi.fn();
const mockRescindInvitation = vi.fn();
const mockRemoveMember = vi.fn();
const mockTxProjectsFindFirst = vi.fn();
const mockTxUsersFindFirst = vi.fn();
const mockTxInvitationsFindMany = vi.fn(async () => []);

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/server/lib/project-access", () => ({
  getProjectRole: (userId: string, projectId: string) => mockGetProjectRole(userId, projectId),
}));

vi.mock("@/server/lib/invitations", () => ({
  createInvitation: (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown) =>
    mockCreateInvitation(a, b, c, d, e),
  rescindInvitation: (a: unknown) => mockRescindInvitation(a),
  removeMember: (a: unknown, b: unknown) => mockRemoveMember(a, b),
}));

const mockTxQuery = {
  projects: { findFirst: mockTxProjectsFindFirst },
  users: { findFirst: mockTxUsersFindFirst },
};

// directDb: conexiones de servicio usadas dentro del flujo para leer
// identidades del equipo (users de otros miembros no son visibles por RLS).
const mockDirectDb = {
  query: {
    users: { findFirst: vi.fn() },
    projects: { findFirst: vi.fn() },
  },
  select: () => ({
    from: () => ({
      leftJoin: () => ({
        where: async () => [],
      }),
    }),
  }),
};

vi.mock("@/shared/db", () => ({
  directDb: mockDirectDb,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: mockTxQuery,
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: async () => [],
          }),
        }),
      }),
    })
  ),
}));

function req(method: string, url: string, body?: unknown) {
  return new Request(
    url,
    body === undefined
      ? { method, headers: { "Content-Type": "application/json" } }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
}

const authed = { data: { user: { id: "u-owner" } } };

describe("members API — equipo real (A-2)", () => {
  let GET: typeof import("./route").GET;
  let POST: typeof import("./route").POST;
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(authed);
    mockGetProjectRole.mockResolvedValue("owner");
    const mod = await import("./route");
    GET = mod.GET;
    POST = mod.POST;
    DELETE = mod.DELETE;
  });

  it("GET sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET({} as Request, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("GET sin permiso → 404", async () => {
    mockGetProjectRole.mockResolvedValue(null);
    const res = await GET({} as Request, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(404);
  });

  it("GET lista owner", async () => {
    mockTxProjectsFindFirst.mockResolvedValue({ id: "p1", ownerId: "u-owner", name: "Sitio" });
    mockDirectDb.query.users.findFirst.mockResolvedValue({
      id: "u-owner",
      email: "owner@x.com",
      fullName: "Owner",
    });
    const res = await GET({} as Request, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.members).toEqual([
      {
        id: "owner-u-owner",
        userId: "u-owner",
        email: "owner@x.com",
        fullName: "Owner",
        role: "owner",
        createdAt: null,
      },
    ]);
    expect(body.invitations).toEqual([]);
  });

  it("POST valida email y rol", async () => {
    const res = await POST(req("POST", "http://x/api", { email: "no-es-email", role: "viewer" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST devuelve 400 porque las invitaciones no están habilitadas", async () => {
    mockTxProjectsFindFirst.mockResolvedValue({ id: "p1", ownerId: "u-owner", name: "Sitio" });
    const res = await POST(
      req("POST", "http://x/api", { email: "nuevo@x.com", role: "editor" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no están habilitadas");
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("POST exige members:manage (viewer → 404)", async () => {
    mockGetProjectRole.mockResolvedValue("viewer");
    const res = await POST(req("POST", "http://x/api", { email: "a@x.com", role: "viewer" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("DELETE rechaza gestión de miembros", async () => {
    const res = await DELETE({ url: "http://x/api?memberUserId=u-2" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("DELETE rechaza anulación de invitaciones", async () => {
    const res = await DELETE({ url: "http://x/api?invitationId=inv-1" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
    expect(mockRescindInvitation).not.toHaveBeenCalled();
  });

  it("DELETE sin parámetros → 400", async () => {
    const res = await DELETE({ url: "http://x/api" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
  });
});
