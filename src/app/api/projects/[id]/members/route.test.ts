/* ═══════════════════════════════════════════════════════════════════════════
   /api/projects/[id]/members — Tests de auth y ownership (VULN-008 fix)
   
   Verifica:
   - 401 sin sesión (GET y POST)
   - 404 con proyecto ajeno (no pertenece al usuario)
   - 200 con proyecto propio (GET) y POST con payload válido
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

type TxShape = {
  query: {
    projects: { findFirst: typeof mockFindFirst };
  };
};

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: TxShape) => Promise<unknown>) =>
    cb({
      query: { projects: { findFirst: mockFindFirst } },
    })
  ),
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id" },
}));

import { GET, POST } from "./route";

function req(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body !== undefined ? "POST" : "GET",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Members API — Auth y ownership (VULN-008)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("http://localhost:3000/api/projects/proj-1/members"), {
      params: Promise.resolve({ id: "proj-1" }),
    } as never);
    expect(res.status).toBe(401);
  });

  it("POST sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      req("http://localhost:3000/api/projects/proj-1/members", { email: "a@b.com", role: "editor" }),
      { params: Promise.resolve({ id: "proj-1" }) } as never
    );
    expect(res.status).toBe(401);
  });

  it("GET con proyecto ajeno → 404", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFindFirst.mockResolvedValue(undefined); // RLS no devuelve el proyecto
    const res = await GET(req("http://localhost:3000/api/projects/proj-999/members"), {
      params: Promise.resolve({ id: "proj-999" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("GET con proyecto propio → 200 con mock de members", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFindFirst.mockResolvedValue({ id: "proj-1" });
    const res = await GET(req("http://localhost:3000/api/projects/proj-1/members"), {
      params: Promise.resolve({ id: "proj-1" }),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBeGreaterThan(0);
  });

  it("POST con proyecto propio y payload válido → 200 con invitación", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFindFirst.mockResolvedValue({ id: "proj-1" });
    const res = await POST(
      req("http://localhost:3000/api/projects/proj-1/members", { email: "a@b.com", role: "editor" }),
      { params: Promise.resolve({ id: "proj-1" }) } as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.invitation.email).toBe("a@b.com");
  });

  it("POST sin email/role → 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFindFirst.mockResolvedValue({ id: "proj-1" });
    const res = await POST(
      req("http://localhost:3000/api/projects/proj-1/members", { email: "" }),
      { params: Promise.resolve({ id: "proj-1" }) } as never
    );
    expect(res.status).toBe(400);
  });
});
