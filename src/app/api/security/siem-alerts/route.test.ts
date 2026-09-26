/* ═══════════════════════════════════════════════════════════════════════════
   Security: SIEM Alerts — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Gate requireAdmin: sin rol admin → 403 y NO consulta la BD
   - Filtros (severity/ruleEventType/ip/status/from/to) y clamps de paginación
   - Respuesta completa: alerts (con nullables normalizados), total, ruleTypes,
     severities y breakdown success/failed
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
  c.offset = () => c;
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

const alertRow = {
  id: "al-1",
  severity: "critical",
  ruleEventType: "dns_change",
  ip: "198.51.100.20",
  status: "success",
  responseCode: 200,
  errorMessage: null,
  metadata: null,
  createdAt: new Date("2026-09-26T09:00:00.000Z"),
};

const fullResponses: unknown[] = [
  [alertRow],
  [{ count: 7 }],
  [{ ruleEventType: "dns_change" }, { ruleEventType: "whois_change" }],
  [{ severity: "critical" }, { severity: "high" }],
  [{ status: "success", count: "5" }, { status: "failed", count: 2 }],
];

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/security/siem-alerts${query}`, { method: "GET" }),
  );
}

function gateDenied() {
  return {
    ok: false as const,
    response: NextResponse.json(
      { success: false, error: "Prohibido: se requiere rol admin" },
      { status: 403 },
    ),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Security: SIEM Alerts — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbResponses = [];
    dbFail = false;
    selectCount = 0;
    whereCalls.length = 0;
    limitCalls.length = 0;
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin rol admin → 403 y NO toca la BD", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied());

    const res = await GET(createRequest());
    expect(res.status).toBe(403);
    expect(selectCount).toBe(0);
  });

  it("admin sin filtros → 200 con alerts, breakdown y facetas", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [...fullResponses];

    const res = await GET(createRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].responseCode).toBe(200);
    expect(body.alerts[0].errorMessage).toBeNull();
    expect(body.alerts[0].metadata).toEqual({});
    expect(body.total).toBe(7);
    expect(body.ruleTypes).toEqual(["dns_change", "whois_change"]);
    expect(body.severities).toEqual(["critical", "high"]);
    expect(body.breakdown).toEqual({ success: 5, failed: 2 });
    // 5 consultas: alerts + count + types + severities + breakdown
    expect(selectCount).toBe(5);
  });

  it("filtros severity/status construyen condiciones where", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[], [{ count: 0 }], [], [], []];

    const res = await GET(createRequest("?severity=high&status=failed&ruleEventType=all&ip=10."));
    expect(res.status).toBe(200);
    // severity + status + ip (ruleEventType=all no cuenta)
    expect(whereCalls.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });

  it("limit > 500 se aclampa a 500", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [[], [{ count: 0 }], [], [], []];

    const res = await GET(createRequest("?limit=10000"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.limit).toBe(500);
    expect(limitCalls).toContain(500);
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
