/* ═══════════════════════════════════════════════════════════════════════════
   Webhooks API — Tests de endpoint
   
   Verifica:
   - Autenticación (401 sin usuario)
   - Validación de body (400 con datos inválidos)
   - SSRF guard (400 con URL interna)
   - DELETE con parámetros faltantes (400)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockDeleteQuery = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: any) => Promise<any>) => {
    return cb({
      query: {
        projects: { findFirst: mockFindFirst },
        webhookConfigs: { findMany: mockFindMany },
      },
      insert: mockInsert,
      delete: mockDeleteQuery,
    });
  }),
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: vi.fn(async (hostname: string) => {
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1") || hostname.includes("10.")) {
      throw new Error("Host privado bloqueado");
    }
    return hostname;
  }),
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id" },
  webhookConfigs: { id: "id", projectId: "projectId" },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, path: string, body?: any): NextRequest {
  const url = `http://localhost:3000/api/webhooks${path}`;
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Webhooks API — Auth", () => {
  let GET: typeof import("./route").GET;
  let POST: typeof import("./route").POST;
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    POST = mod.POST;
    DELETE = mod.DELETE;
  });

  it("GET sin auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("GET", "?projectId=abc"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("No autorizado");
  });

  it("POST sin auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(createRequest("POST", "", { projectId: "abc", name: "test", url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("DELETE sin auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(createRequest("DELETE", "?id=x&projectId=y"));
    expect(res.status).toBe(401);
  });
});

describe("Webhooks API — Validación", () => {
  let GET: typeof import("./route").GET;
  let POST: typeof import("./route").POST;
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    POST = mod.POST;
    DELETE = mod.DELETE;
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFindFirst.mockResolvedValue({ id: "project-1" });
  });

  it("GET sin projectId → 400", async () => {
    const res = await GET(createRequest("GET", ""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Falta ID");
  });

  it("POST sin name → 400", async () => {
    const res = await POST(createRequest("POST", "", {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      url: "https://hooks.example.com",
    }));
    expect(res.status).toBe(400);
  });

  it("POST con URL vacía → 400", async () => {
    const res = await POST(createRequest("POST", "", {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      name: "test",
      url: "",
    }));
    expect(res.status).toBe(400);
  });

  it("POST con URL interna localhost → 400 (SSRF guard)", async () => {
    const res = await POST(createRequest("POST", "", {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      name: "evil",
      url: "http://localhost:5432/webhook",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("no permitida");
  });

  it("POST con URL interna 10.x → 400 (SSRF guard)", async () => {
    const res = await POST(createRequest("POST", "", {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      name: "evil",
      url: "http://10.0.0.5/webhook",
    }));
    expect(res.status).toBe(400);
  });

  it("DELETE sin id → 400", async () => {
    const res = await DELETE(createRequest("DELETE", "?projectId=project-1"));
    expect(res.status).toBe(400);
  });

  it("DELETE sin projectId → 400", async () => {
    const res = await DELETE(createRequest("DELETE", "?id=wh-1"));
    expect(res.status).toBe(400);
  });

  it("DELETE con id y projectId → 200", async () => {
    mockDeleteQuery.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const res = await DELETE(createRequest("DELETE", "?id=wh-1&projectId=project-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("POST con datos válidos → genera whsec_ token", async () => {
    mockInsert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "wh-1", secretToken: "whsec_test" }]) }) });
    // Para que el POST funcione, necesitamos que el insert devuelva .returning()
    // Pero el código real usa tx.insert().values().returning()
    // Necesitamos mockear el chain correctamente
    const returningMock = vi.fn().mockResolvedValue([{
      id: "wh-new",
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Mi Webhook",
      url: "https://hooks.example.com/endpoint",
      secretToken: "whsec_abc123",
      events: ["audit.completed"],
      active: true,
    }]);

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: returningMock }),
    });

    const res = await POST(createRequest("POST", "", {
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Mi Webhook",
      url: "https://hooks.example.com/endpoint",
      events: ["audit.completed"],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.webhook).toBeDefined();
  });
});
