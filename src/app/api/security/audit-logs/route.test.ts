/* ═══════════════════════════════════════════════════════════════════════════
   Security: Audit Logs — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Gate requireAdmin: sin rol admin → 403 y NO consulta la BD
   - Filtros (eventType/ip/from/to/metadataAction) y clamps de paginación
     (limit ≤ 500, offset ≥ 0)
   - Respuesta completa: logs, total, limit, offset, eventTypes
   - Error de BD → 500 con error interno
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();

let dbResponses: unknown[] = [];
let dbFail = false;
let selectCount = 0;
const whereCalls: unknown[] = [];
const limitCalls: number[] = [];
const offsetCalls: number[] = [];

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = (w?: unknown) => {
    whereCalls.push(w);
    return c;
  };
  c.orderBy = () => c;
  c.groupBy = () => c;
  c.limit = (n?: number) => {
    limitCalls.push(n);
    return c;
  };
  c.offset = (n?: number) => {
    offsetCalls.push(n);
    return c;
  };
  c.then = (onF?: unknown, onR?: unknown) =>
    (dbFail ? Promise.reject(new Error("db down")) : Promise.resolve(result)).then(
      onF as never,
      onR as never,
    );
  return c;
}

vi.mock("@/server/auth/admin", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => {
      const res = dbResponses[Math.min(selectCount, dbResponses.length - 1)] ?? [];
      selectCount += 1;
      return chain(res);
    },
  },
  db: {},
}));

// ─── Datos ──────────────────────────────────────────────────────────────────

const logRow = {
  id: "log-1",
  eventType: "login_failed",
  ip: "203.0.113.10",
  metadata: { action: "LOGIN_FAILED" },
  createdAt: new Date("2026-09-26T10:00:00.000Z"),
};

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/security/audit-logs${query}`, { method: "GET" }),
  );
}

function gateDenied(status: 401 | 403 = 403) {
  return {
    ok: false as const,
    response: NextResponse.json(
      { success: false, error: status === 401 ? "No autorizado" : "Prohibido: se requiere rol admin" },
      { status },
    ),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Security: Audit Logs — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbResponses = [];
    dbFail = false;
    selectCount = 0;
    whereCalls.length = 0;
    limitCalls.length = 0;
    offsetCalls.length = 0;
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin rol admin → 403 y NO toca la BD", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(403));

    const res = await GET(createRequest());
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toContain("admin");
    expect(selectCount).toBe(0);
  });

  it("sesión no autenticada → 401", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(401));

    const res = await GET(createRequest());
    expect(res.status).toBe(401);
    expect(selectCount).toBe(0);
  });

  it("admin sin filtros → 200 con logs, total y eventTypes", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[logRow], [{ count: 3 }], [{ eventType: "login_failed" }, { eventType: "csp_violation" }]];

    const res = await GET(createRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].eventType).toBe("login_failed");
    expect(body.total).toBe(3);
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
    expect(body.eventTypes).toEqual(["login_failed", "csp_violation"]);
    // 3 consultas: logs + count + distinct eventTypes
    expect(selectCount).toBe(3);
  });

  it("limit fuera de rango se aclampa a [1, 500] y offset negativo a 0", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[], [{ count: 0 }], []];

    const res = await GET(createRequest("?limit=9999&offset=-5"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.limit).toBe(500);
    expect(body.offset).toBe(0);
    expect(limitCalls).toContain(500);
    expect(offsetCalls).toContain(0);
  });

  it("filtros válidos construyen condiciones where", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[], [{ count: 1 }], [{ eventType: "login_failed" }]];

    const res = await GET(
      createRequest(
        "?eventType=login_failed&ip=203.0&from=2026-01-01&to=2026-12-31&metadataAction=LOGIN_FAILED",
      ),
    );
    expect(res.status).toBe(200);
    // count + logs + types → 3 where (logs, count, ...): eventType/ip/from/to/action
    expect(whereCalls.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(whereCalls[0]).toBeDefined();
    expect(whereCalls[0]).not.toBeNull();
  });

  it("fechas inválidas y eventType=all se ignoran (sin condiciones)", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[], [{ count: 0 }], []];

    const res = await GET(createRequest("?eventType=all&from=not-a-date&to=nope"));
    expect(res.status).toBe(200);
    expect(whereCalls[0]).toBeUndefined();
  });

  it("falla de BD → 500 con error interno", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbFail = true;

    const res = await GET(createRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
  });
});
