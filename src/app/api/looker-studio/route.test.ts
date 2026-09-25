import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schemas from "@/shared/db/schemas";

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

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join("");
      if (typeof value === "string") return value;
      return "";
    })
    .join("");
}

function createBatchedTx(opts: {
  projectRows: unknown[];
  gscRows?: unknown[];
  ga4Rows?: unknown[];
  auditRows?: unknown[];
  kwRows?: unknown[];
  crawlRows?: unknown[];
  issueRows?: unknown[];
}) {
  let calls = 0;
  const executedRaw: unknown[] = [];
  const tx = {
    execute: async (query: unknown) => {
      calls++;
      executedRaw.push(query);
      const text = sqlText(query);
      if (text.includes("integration_data_gsc")) return { rows: opts.gscRows ?? [] };
      if (text.includes("integration_data_ga4")) return { rows: opts.ga4Rows ?? [] };
      if (text.includes("DISTINCT ON")) return { rows: opts.auditRows ?? [] };
      return { rows: [] };
    },
    select: () => ({
      from: (table: unknown) => {
        const rowsFor = (): unknown[] => {
          if (table === schemas.projects) return opts.projectRows;
          if (table === schemas.keywordTargets) return opts.kwRows ?? [];
          if (table === schemas.crawlResults) return opts.crawlRows ?? [];
          if (table === schemas.issues) return opts.issueRows ?? [];
          return [];
        };
        return {
          where: () => {
            calls++;
            const result = rowsFor();
            return {
              groupBy: async () => result,
              then: (
                onFulfilled?: (value: unknown) => unknown,
                onRejected?: (reason: unknown) => unknown
              ) => Promise.resolve(result).then(onFulfilled, onRejected),
            };
          },
        };
      },
    }),
  };
  return { tx, getCalls: () => calls, getExecutedRaw: () => executedRaw };
}

describe("GET /api/looker-studio — enriquecimiento batcheado (fix N+1)", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    mockWithRLS.mockImplementation(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb({}));
  });

  it("2 proyectos → queries fijas (7) y salida idéntica: score/crawled/keywords/ métricas", async () => {
    const now = new Date();
    const todayTarget = new Date();
    todayTarget.setDate(now.getDate());
    const todayIso = todayTarget.toISOString().split("T")[0]!;

    const { tx, getCalls, getExecutedRaw } = createBatchedTx({
      projectRows: [
        { id: "p1", name: "Alpha", domain: "a.com", ownerId: "user-1" },
        { id: "p2", name: "Beta", domain: "b.com", ownerId: "user-1" },
      ],
      auditRows: [
        { project_id: "p1", id: "aud-1", status: "completed" },
        { project_id: "p2", id: "aud-2", status: "running" },
      ],
      crawlRows: [{ auditId: "aud-1", total: 7 }],
      issueRows: [{ auditId: "aud-1", criticalCount: 1, warningCount: 2 }],
      kwRows: [{ projectId: "p1", total: 5 }],
      gscRows: [
        { project_id: "p1", date: todayIso, clicks: 42, impressions: 1000, ctr: "0.0420", position: "8.50" },
      ],
      ga4Rows: [
        { project_id: "p1", date: todayIso, activeUsers: 13, conversions: 4, engagementRate: "0.6100" },
      ],
    });

    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    mockWithRLS.mockImplementation((_userId, cb) => cb(tx));

    try {
      const res = await GET(
        createRequest("http://localhost/api/looker-studio", {
          Authorization: `Bearer ${KEY}`,
          "x-forwarded-for": "10.1.0.8",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      // 2 proyectos × 15 días
      expect(body.rows).toHaveLength(30);

      const alphaRows = body.rows.filter((r: { values: unknown[] }) => r.values[1] === "Alpha");
      const betaRows = body.rows.filter((r: { values: unknown[] }) => r.values[1] === "Beta");
      expect(alphaRows).toHaveLength(15);
      expect(betaRows).toHaveLength(15);

      // score = 100 - 15*1 - 5*2 = 75; crawled = 7; keywords = 5
      expect(alphaRows[0].values[3]).toBe(75);
      expect(alphaRows[0].values[4]).toBe(7);
      expect(alphaRows[0].values[12]).toBe(5);
      // fila de hoy: GSC + GA4 reales
      const todayRow = alphaRows.find((r: { values: unknown[] }) => String(r.values[0]) === todayIso.replace(/-/g, ""));
      expect(todayRow.values[5]).toBe(42);
      expect(todayRow.values[9]).toBe(13);

      // p2: última auditoría running → score/crawled null; 0 keywords
      expect(betaRows[0].values[3]).toBeNull();
      expect(betaRows[0].values[4]).toBeNull();
      expect(betaRows[0].values[12]).toBe(0);

      expect(body.meta.totalProjects).toBe(2);
      expect(body.meta.isDemoData).toBe(false);

      // Sin N+1: 7 queries fijas (1 projects + 3 raw + 1 kw + 2 fase-2)
      expect(getCalls()).toBe(7);

      // Regresión: en raw sql de drizzle el array aporta sus propios
      // paréntesis → `IN ($1, $2)` y nunca `IN (($1, $2))` (inválido en PG).
      const rawWithIn = getExecutedRaw().filter((q) => sqlText(q).includes("project_id IN"));
      expect(rawWithIn).toHaveLength(3);
      for (const q of rawWithIn) {
        const built = new PgDialect().sqlToQuery(q as never);
        expect(built.sql).not.toContain("IN ((");
        expect(built.sql).toMatch(/project_id IN \(\$1/);
      }
    } finally {
      mockWithRLS.mockImplementation(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb({}));
    }
  });

  it("sin proyectos → 0 queries de enriquecimiento", async () => {
    const { tx, getCalls } = createBatchedTx({ projectRows: [] });
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    mockWithRLS.mockImplementation((_userId, cb) => cb(tx));

    try {
      const res = await GET(
        createRequest("http://localhost/api/looker-studio", {
          Authorization: `Bearer ${KEY}`,
          "x-forwarded-for": "10.1.0.9",
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rows).toEqual([]);
      // solo la select de projects (sin enriquecimiento)
      expect(getCalls()).toBe(1);
    } finally {
      mockWithRLS.mockImplementation(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb({}));
    }
  });
});
