/* ═══════════════════════════════════════════════════════════════════════════
   API Keys: Usage (estadísticas de uso de una key) — Tests de endpoint (TD-03 lote 3)

   withRateLimit en passthrough (inyecta userId); directDb simulado con cola de
   5 selects (total, hoy, semana, mes, breakdown diario). Verifica:
   - 200 con keyName, contadores, lastUsedAt y dailyBreakdown
   - Sin eventos de uso → contadores en cero, breakdown vacío, lastUsedAt null
   - Key inexistente → 404; key de otro usuario → 403
   - Sin keyId en la ruta → 400; error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();

let selectQueue: unknown[][] = [];
let selectCalls = 0;

function nextSelectResult(): Promise<unknown> {
  selectCalls += 1;
  return Promise.resolve(selectQueue.shift() ?? []);
}

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (_cfg: unknown, handler: unknown) => handler,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        then: (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) => nextSelectResult().then(resolve, reject),
      };
      return chain;
    },
    query: {
      developerApiKeys: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  developerApiKeys: {
    id: "id",
    userId: "userId",
    name: "name",
    keyPrefix: "keyPrefix",
    lastUsedAt: "lastUsedAt",
  },
  securityAuditLogs: {
    eventType: "eventType",
    metadata: "metadata",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn(() => "and"),
  gte: vi.fn(() => "gte"),
  sql: vi.fn(() => "sql"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(keyId = "k-1"): Request {
  return new Request(`http://localhost:3000/api/api-keys/${keyId}/usage`);
}

const keyRecord = {
  id: "k-1",
  name: "CI key",
  keyPrefix: "sk_live_a1b2",
  userId: "u-1",
  lastUsedAt: new Date("2026-09-25T10:00:00.000Z"),
};

// Orden de los selects: total, hoy, semana, mes, breakdown diario
function setupSelects(results: unknown[][]) {
  selectQueue = results.map((rows) => rows);
}

const defaultSelects = [
  [{ count: 120 }],
  [{ count: 9 }],
  [{ count: 41 }],
  [{ count: 87 }],
  [
    { date: "2026-09-25", count: 6 },
    { date: "2026-09-26", count: 9 },
  ],
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("API Keys: Usage — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    selectCalls = 0;
    setupSelects(defaultSelects);
    mockFindFirst.mockResolvedValue(keyRecord);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("key válida → 200 con contadores y breakdown diario", async () => {
    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      keyName: "CI key",
      keyPrefix: "sk_live_a1b2",
      totalRequests: 120,
      todayRequests: 9,
      thisWeekRequests: 41,
      thisMonthRequests: 87,
      lastUsedAt: "2026-09-25T10:00:00.000Z",
      dailyBreakdown: [
        { date: "2026-09-25", count: 6 },
        { date: "2026-09-26", count: 9 },
      ],
    });
    expect(selectCalls).toBe(5);
  });

  it("sin eventos de uso → contadores en cero y breakdown vacío", async () => {
    setupSelects([[], [], [], [], []]);
    mockFindFirst.mockResolvedValue({ ...keyRecord, lastUsedAt: null });

    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalRequests).toBe(0);
    expect(body.todayRequests).toBe(0);
    expect(body.thisWeekRequests).toBe(0);
    expect(body.thisMonthRequests).toBe(0);
    expect(body.lastUsedAt).toBeNull();
    expect(body.dailyBreakdown).toEqual([]);
  });

  it("key inexistente → 404 sin consultar el uso", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await GET(createRequest("k-none") as never, "u-1");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("API Key no encontrada");
    expect(selectCalls).toBe(0);
  });

  it("key de otro usuario → 403", async () => {
    mockFindFirst.mockResolvedValue({ ...keyRecord, userId: "u-other" });

    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Acceso denegado");
    expect(selectCalls).toBe(0);
  });

  it("ruta sin keyId → 400", async () => {
    const res = await GET(
      new Request("http://localhost:3000/usage") as never,
      "u-1",
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Key ID requerido");
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("error de BD → 500", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Error interno del servidor");
  });
});
