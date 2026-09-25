import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetProjectRole = vi.fn(async (_u: string, _p: string): Promise<string | null> => "admin");
const mockWithRLS = vi.fn(
  async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)
);

const db = {
  project: null as null | { id: string },
  entries: [] as Array<Record<string, unknown>>,
  count: 0,
};

const mockTx = {
  query: {
    projects: {
      findFirst: vi.fn(async () => db.project),
    },
    teamAuditLogs: {
      findMany: vi.fn(async () => db.entries),
    },
  },
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ total: db.count }]),
    })),
  })),
};

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/server/lib/project-access", () => ({
  getProjectRole: (userId: string, projectId: string) => mockGetProjectRole(userId, projectId),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) => mockWithRLS(userId, cb),
}));

const entry = {
  id: "a1",
  projectId: "p1",
  actorId: "u-admin",
  action: "member_invited",
  targetEmail: "nuevo@x.com",
  role: "viewer",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
};

const authed = { data: { user: { id: "u-admin" } } };

function req(url: string) {
  return new Request(url);
}

describe("projects/[id]/audit-log API — team_audit_logs paginado", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(authed);
    mockGetProjectRole.mockResolvedValue("admin");
    db.project = { id: "p1" };
    db.entries = [entry];
    db.count = 1;
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("sin membresía → 404", async () => {
    mockGetProjectRole.mockResolvedValue(null);
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("editor no tiene audit-log:read → 404", async () => {
    mockGetProjectRole.mockResolvedValue("editor");
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("viewer no tiene audit-log:read → 404", async () => {
    mockGetProjectRole.mockResolvedValue("viewer");
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
  });

  it("owner puede leer → 200 con entradas mapeadas", async () => {
    mockGetProjectRole.mockResolvedValue("owner");
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      projectId: "p1",
      page: 1,
      limit: 20,
      total: 1,
    });
    expect(body.entries[0]).toEqual({
      id: "a1",
      action: "member_invited",
      targetEmail: "nuevo@x.com",
      role: "viewer",
      actorId: "u-admin",
      createdAt: "2026-01-02T03:04:05.000Z",
    });
  });

  it("pagina con page/limit (offset calculado)", async () => {
    db.entries = [];
    db.count = 7;
    const res = await GET(req("http://x/api/projects/p1/audit-log?page=2&limit=5"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ page: 2, limit: 5, total: 7, entries: [] });
    expect(mockTx.query.teamAuditLogs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 5 })
    );
  });

  it("page inválida → 400", async () => {
    const res = await GET(req("http://x/api/projects/p1/audit-log?page=0"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("limit inválido → 400", async () => {
    const res = await GET(req("http://x/api/projects/p1/audit-log?limit=abc"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
  });

  it("proyecto inexistente bajo RLS → 404", async () => {
    db.project = null;
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
  });

  it("withRLS falla → 500", async () => {
    mockWithRLS.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("http://x/api/projects/p1/audit-log"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(500);
  });
});
