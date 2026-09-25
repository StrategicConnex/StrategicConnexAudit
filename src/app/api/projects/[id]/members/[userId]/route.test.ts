import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetProjectRole = vi.fn(async (_u: string, _p: string): Promise<string | null> => "owner");
const mockRemoveMember = vi.fn(async (_projectId: string, _userId: string): Promise<boolean> => true);

// Estado del servicio real (@/server/lib/rbac) detrás de directDb simulado.
const db = {
  project: null as null | { id: string; ownerId: string },
  member: null as null | { id: string; role: string },
  ownerCount: 0,
  user: null as null | { email: string },
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
};

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/server/lib/project-access", () => ({
  getProjectRole: (userId: string, projectId: string) => mockGetProjectRole(userId, projectId),
}));

vi.mock("@/server/lib/invitations", () => ({
  removeMember: (projectId: string, userId: string) => mockRemoveMember(projectId, userId),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: { findFirst: vi.fn(async () => db.project) },
      projectMembers: { findFirst: vi.fn(async () => db.member) },
      users: { findFirst: vi.fn(async () => db.user) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ total: db.ownerCount }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          db.updates.push(values);
          return [{ id: db.member?.id ?? "m-1" }];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        db.inserts.push(values);
        return [{ id: "a-1" }];
      }),
    })),
  },
}));

const authed = { data: { user: { id: "u-owner" } } };

function jsonReq(method: string, body?: unknown) {
  return new Request("http://x/api", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function ctx(targetUserId: string) {
  return { params: Promise.resolve({ id: "p1", userId: targetUserId }) };
}

describe("members/[userId] API — update y baja de miembros", () => {
  let PATCH: typeof import("./route").PATCH;
  let PUT: typeof import("./route").PUT;
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(authed);
    mockGetProjectRole.mockResolvedValue("owner");
    mockRemoveMember.mockResolvedValue(true);
    db.project = { id: "p1", ownerId: "u-owner" };
    db.member = { id: "m-2", role: "editor" };
    db.ownerCount = 0;
    db.user = { email: "target@x.com" };
    db.updates = [];
    db.inserts = [];
    const mod = await import("./route");
    PATCH = mod.PATCH;
    PUT = mod.PUT;
    DELETE = mod.DELETE;
  });

  it("PATCH sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(401);
  });

  it("PATCH sin membresía → 404", async () => {
    mockGetProjectRole.mockResolvedValue(null);
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(404);
  });

  it("PATCH con rol insuficiente (viewer) → 404", async () => {
    mockGetProjectRole.mockResolvedValue("viewer");
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(404);
    expect(db.updates).toHaveLength(0);
  });

  it("PATCH con rol inválido (owner en body) → 400", async () => {
    const res = await PATCH(jsonReq("PATCH", { role: "owner" }), ctx("u-2"));
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it("PATCH actualiza el rol y audita role_changed", async () => {
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, userId: "u-2", role: "admin" });
    expect(db.updates[0]).toMatchObject({ role: "admin" });
    expect(db.inserts[0]).toMatchObject({ action: "role_changed", targetEmail: "target@x.com" });
  });

  it("PUT es alias de PATCH", async () => {
    const res = await PUT(jsonReq("PUT", { role: "viewer" }), ctx("u-2"));
    expect(res.status).toBe(200);
    expect(db.updates[0]).toMatchObject({ role: "viewer" });
  });

  it("PATCH sobre el owner del proyecto → 403 owner-protected", async () => {
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-owner"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("propietario");
    expect(db.updates).toHaveLength(0);
  });

  it("PATCH rol propio → 403 self-modify", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-admin" } } });
    mockGetProjectRole.mockResolvedValue("admin");
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-admin"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("tu propio rol");
    expect(db.updates).toHaveLength(0);
  });

  it("PATCH miembro inexistente → 404", async () => {
    db.member = null;
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(404);
    expect(db.updates).toHaveLength(0);
  });

  it("PATCH último owner del proyecto_members → 403 last-owner", async () => {
    db.member = { id: "m-3", role: "owner" };
    db.ownerCount = 1;
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-2"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("último propietario");
    expect(db.updates).toHaveLength(0);
  });

  it("DELETE sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(401);
  });

  it("DELETE con rol insuficiente → 404", async () => {
    mockGetProjectRole.mockResolvedValue("editor");
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(404);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("DELETE expulsa al miembro y audita member_removed", async () => {
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(mockRemoveMember).toHaveBeenCalledWith("p1", "u-2");
    expect(db.inserts[0]).toMatchObject({ action: "member_removed" });
  });

  it("DELETE del owner del proyecto → 403", async () => {
    const res = await DELETE({} as Request, ctx("u-owner"));
    expect(res.status).toBe(403);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("DELETE miembro inexistente → 404", async () => {
    db.member = null;
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(404);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("DELETE último owner → 403", async () => {
    db.member = { id: "m-3", role: "owner" };
    db.ownerCount = 1;
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(403);
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });
});
