import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn(async () => ({ data: { user: null } }));
const mockWithRLS = vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb({}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: mockWithRLS,
}));

vi.mock("@/shared/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
  },
  directDb: { insert: vi.fn() },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", ownerId: "ownerId", deletedAt: "deletedAt", isDeleted: "isDeleted", isHidden: "isHidden" },
  audits: { projectId: "projectId", createdAt: "createdAt", status: "status" },
  integrationDataGsc: { projectId: "projectId", date: "date" },
  integrationDataGa4: { projectId: "projectId", date: "date" },
  keywordTargets: { projectId: "projectId" },
  issues: { auditId: "auditId", severity: "severity" },
  crawlResults: { auditId: "auditId" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function createRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request(url, { method: "GET", headers }));
}

const KEY = "looker-test-key-123";

let originalKey: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalKey = process.env.LOOKER_STUDIO_API_KEY;
  process.env.LOOKER_STUDIO_API_KEY = KEY;
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.LOOKER_STUDIO_API_KEY;
  } else {
    process.env.LOOKER_STUDIO_API_KEY = originalKey;
  }
});

describe("GET /api/looker-studio — autenticación fail-closed (VULN-006)", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin header Authorization → 401", async () => {
    const res = await GET(createRequest("http://localhost/api/looker-studio", { "x-forwarded-for": "10.1.0.1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("LOOKER_STUDIO_API_KEY no configurada → 401 (fail-closed, nunca abierto)", async () => {
    delete process.env.LOOKER_STUDIO_API_KEY;
    const res = await GET(
      createRequest("http://localhost/api/looker-studio", {
        Authorization: `Bearer ${KEY}`,
        "x-forwarded-for": "10.1.0.2",
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toContain("no configurada");
  });

  it("Bearer incorrecto → 401", async () => {
    const res = await GET(
      createRequest("http://localhost/api/looker-studio", {
        Authorization: "Bearer wrong-key",
        "x-forwarded-for": "10.1.0.3",
      })
    );
    expect(res.status).toBe(401);
  });

  it("api key por query param (?apiKey=) sin header → 401 (regresión: nunca se acepta)", async () => {
    const res = await GET(
      createRequest(`http://localhost/api/looker-studio?apiKey=${KEY}`, { "x-forwarded-for": "10.1.0.4" })
    );
    expect(res.status).toBe(401);
  });

  it("Bearer válido sin sesión de usuario → 200 con dataset vacío y meta honesta", async () => {
    const res = await GET(
      createRequest("http://localhost/api/looker-studio", {
        Authorization: `Bearer ${KEY}`,
        "x-forwarded-for": "10.1.0.5",
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Remaining")).not.toBeNull();
    const body = await res.json();
    expect(body.schema).toHaveLength(13);
    expect(body.rows).toEqual([]);
    expect(body.meta.totalProjects).toBe(0);
    expect(body.meta.isDemoData).toBe(true);
    expect(body.meta.version).toBe("2.1");
  });

  it("type=schema → 200 solo con el schema", async () => {
    const res = await GET(
      createRequest("http://localhost/api/looker-studio?type=schema", {
        Authorization: `Bearer ${KEY}`,
        "x-forwarded-for": "10.1.0.6",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema).toHaveLength(13);
    expect(body.rows).toBeUndefined();
  });

  it("sesión de usuario autenticada → 200 (rama withRLS, sin proyectos)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    mockWithRLS.mockResolvedValueOnce([]);
    const res = await GET(
      createRequest("http://localhost/api/looker-studio", {
        Authorization: `Bearer ${KEY}`,
        "x-forwarded-for": "10.1.0.7",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.totalProjects).toBe(0);
  });

  it("rate limit: 61ª request en la ventana → 429 con Retry-After", async () => {
    const headers = { Authorization: `Bearer ${KEY}`, "x-forwarded-for": "10.1.99.99" };
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) {
      last = await GET(createRequest("http://localhost/api/looker-studio", headers));
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBe("60");
  });

  it("OPTIONS → 204 con CORS dev no-producción", async () => {
    const { OPTIONS } = await import("./route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
