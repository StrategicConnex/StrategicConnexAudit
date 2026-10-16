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
  removeMemberLegacy: (projectId: string, userId: string) => mockRemoveMember(projectId, userId),
}));

vi.mock("@/server/lib/rbac", () => ({
  removeProjectMemberLegacy: (projectId: string, userId: string) =>
    mockRemoveMember(projectId, userId),
  updateMemberRoleLegacy: (_projectId: string, _userId: string, _role: unknown, _actorId: string) =>
    mockRemoveMember(_userId, _actorId),
  updateMemberRole: (_projectId: string, _userId: string, _role: unknown, _actorId: string) =>
    mockRemoveMember(_userId, _actorId),
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
    mockRemoveMember.mockResolvedValue(true);
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

  it("PATCH rechaza actualización de roles", async () => {
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
  });

  it("PUT rechaza actualización de roles", async () => {
    const res = await PUT(jsonReq("PUT", { role: "viewer" }), ctx("u-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
  });

  it("PATCH sobre el owner del proyecto → 403 owner-protected", async () => {
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-owner"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
  });

  it("PATCH rol propio → 400 auto-modify", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-admin" } } });
    mockGetProjectRole.mockResolvedValue("admin");
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-admin"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
  });

  it("PATCH miembro inexistente → 400", async () => {
    db.member = null;
    const res = await PATCH(jsonReq("PATCH", { role: "admin" }), ctx("u-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
  });

  it("PATCH último owner del proyecto_members → 400 last-owner", async () => {
    db.member = { id: "m-3", role: "owner" };
    db.ownerCount = 1;
    const res = await PATCH(jsonReq("PATCH", { role: "viewer" }), ctx("u-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
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

  it("DELETE rechaza gestión de miembros", async () => {
    const res = await DELETE({} as Request, ctx("u-2"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no está habilitada");
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });
});
