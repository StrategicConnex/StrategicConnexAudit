/* ═══════════════════════════════════════════════════════════════════════════
   API Keys: Usage (estadísticas de uso de una key) — Tests de endpoint (Oleada 3)

   withRateLimit en passthrough (inyecta userId); withRLS simulado entrega la
   `tx` con cola de 5 selects (total, hoy, semana, mes, breakdown diario).
   Verifica:
   - 200 con keyName, contadores, lastUsedAt y dailyBreakdown
   - Sin eventos de uso → contadores en cero, breakdown vacío, lastUsedAt null
   - Key inexistente → 404; key de otro usuario → 404 (RLS la hace invisible)
   - Sin keyId en la ruta → 400; error de BD → 500
   P0.2: lecturas bajo la autoridad del usuario autenticado.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  withRLS: vi.fn(),
}));

let selectQueue: unknown[][] = [];
let selectCalls = 0;

function nextSelectResult(): Promise<unknown> {
  selectCalls += 1;
  return Promise.resolve(selectQueue.shift() ?? []);
}

function buildTx() {
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
  return {
    select: () => chain,
    query: {
      developerApiKeys: { findFirst: (...args: unknown[]) => mocks.findFirst(...args) },
    },
  };
}

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (_cfg: unknown, handler: unknown) => handler,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    mocks.withRLS(userId, cb);
    return cb(buildTx());
  },
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
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
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
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
    mocks.findFirst.mockResolvedValue(keyRecord);
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
    mocks.findFirst.mockResolvedValue({ ...keyRecord, lastUsedAt: null });

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
    mocks.findFirst.mockResolvedValue(undefined);

    const res = await GET(createRequest("k-none") as never, "u-1");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("API Key no encontrada");
    expect(selectCalls).toBe(0);
  });

  it("key de otro usuario → 404 (RLS la hace invisible, sin revelar que existe)", async () => {
    // Bajo RLS `developer_api_keys_select_own` no devuelve la fila ajena: el
    // endpoint responde 404 igual que para una key inexistente (antes, con
    // directDb, leía la fila y devolvía 403 revelando que el id existía).
    mocks.findFirst.mockResolvedValue(undefined);

    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("API Key no encontrada");
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
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("P0.2: las lecturas corren bajo la autoridad del usuario autenticado", async () => {
    await GET(createRequest() as never, "u-1");

    expect(mocks.withRLS).toHaveBeenCalledWith("u-1", expect.any(Function));
    expect(selectCalls).toBe(5);
  });

  it("error de BD → 500", async () => {
    mocks.findFirst.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest() as never, "u-1");
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Error interno del servidor");
  });
});
