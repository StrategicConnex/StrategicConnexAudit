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
  projectInvitations: { findMany: mockTxInvitationsFindMany },
};

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

  it("GET lista owner + miembros reales", async () => {
    mockTxQuery.projects.findFirst.mockResolvedValue({ id: "p1", ownerId: "u-owner", name: "Sitio" });
    mockTxQuery.users.findFirst.mockResolvedValue({
      id: "u-owner",
      email: "owner@x.com",
      fullName: "Owner",
    });
    const res = await GET({} as Request, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.members[0]).toMatchObject({ email: "owner@x.com", role: "owner" });
    expect(body.invitations).toEqual([]);
  });

  it("POST valida email y rol", async () => {
    const res = await POST(req("POST", "http://x/api", { email: "no-es-email", role: "viewer" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST crea invitación real", async () => {
    mockTxProjectsFindFirst.mockResolvedValue({ id: "p1", ownerId: "u-owner", name: "Sitio" });
    mockCreateInvitation.mockResolvedValue({
      id: "inv-1",
      email: "nuevo@x.com",
      role: "editor",
      expiresAt: new Date().toISOString(),
      inviteUrl: "http://x/invite/tok",
      emailSent: false,
    });
    const res = await POST(
      req("POST", "http://x/api", { email: "nuevo@x.com", role: "editor" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
  });

  it("POST exige members:manage (viewer → 404)", async () => {
    mockGetProjectRole.mockResolvedValue("viewer");
    const res = await POST(req("POST", "http://x/api", { email: "a@x.com", role: "viewer" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("DELETE expulsa miembro", async () => {
    mockRemoveMember.mockResolvedValue(true);
    const res = await DELETE({ url: "http://x/api?memberUserId=u-2" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("DELETE anula invitación", async () => {
    mockRescindInvitation.mockResolvedValue(true);
    const res = await DELETE({ url: "http://x/api?invitationId=inv-1" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect((await res.json()).success).toBe(true);
  });

  it("DELETE sin parámetros → 400", async () => {
    const res = await DELETE({ url: "http://x/api" } as Request, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
  });
});
