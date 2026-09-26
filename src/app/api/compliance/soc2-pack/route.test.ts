/* ═══════════════════════════════════════════════════════════════════════════
   Compliance: SOC 2 Evidence Pack — Tests de endpoint (TD-03 lote 3)

   Paquete de evidencias de los últimos 90 días con hash SHA-256 de cadena de
   custodia. Verifica:
   - Gate requireAdmin: 401 sin sesión y 403 sin rol admin, sin tocar la BD
   - 200 con los 5 controles (CC6.1, CC7.2, CC7.3, CC8.1, A1.2) y sha256
   - Cabeceras de descarga (attachment + no-store)
   - Caso borde: BD vacía → conteos a 0 y listas vacías
   - Error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();

let dbResponses: unknown[] = [];
let selectCount = 0;
let dbFail = false;

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.groupBy = () => c;
  c.orderBy = () => c;
  c.limit = () => c;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function gateDenied(status: 401 | 403 = 403) {
  return {
    ok: false as const,
    response: NextResponse.json(
      {
        success: false,
        error: status === 401 ? "No autorizado" : "Prohibido: se requiere rol admin",
      },
      { status },
    ),
  };
}

// Orden de directDb.select: users, projectMembers, admins, securityEvents,
// siem, assessments, vulnerabilities, auditLogs
const fullResponses = [
  [{ n: 5 }],
  [{ n: 12 }],
  [{ n: 2 }],
  [
    { eventType: "login_failed", n: "7" },
    { eventType: "csp_violation", n: "3" },
  ],
  [{ n: 41 }],
  [{ n: 9 }],
  [
    { severity: "critical", n: "4" },
    { severity: "high", n: "6" },
  ],
  [{ n: 15 }],
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Compliance: SOC 2 Pack — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbResponses = [];
    selectCount = 0;
    dbFail = false;
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sesión no autenticada → 401 sin tocar la BD", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(401));

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(selectCount).toBe(0);
  });

  it("sin rol admin → 403 sin tocar la BD", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(403));

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("admin");
    expect(selectCount).toBe(0);
  });

  it("admin → 200 con 5 controles, sha256 y cabeceras de descarga", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = fullResponses;

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="soc2-evidence-pack.json"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.pack.windowDays).toBe(90);
    expect(typeof body.pack.generatedAt).toBe("string");

    expect(body.pack.controls).toHaveLength(5);
    expect(body.pack.controls.map((c: { control: string }) => c.control)).toEqual([
      "CC6.1",
      "CC7.2",
      "CC7.3",
      "CC8.1",
      "A1.2",
    ]);

    const [cc61, cc72, cc73, cc81] = body.pack.controls;
    expect(cc61.evidence).toMatchObject({
      users: 5,
      platformAdmins: 2,
      projectMemberships: 12,
    });
    expect(cc72.evidence.securityEventsByType).toEqual([
      { type: "login_failed", count: 7 },
      { type: "csp_violation", count: 3 },
    ]);
    expect(cc72.evidence.siemDeliveries).toBe(41);
    expect(cc73.evidence.assessments).toBe(9);
    expect(cc73.evidence.vulnerabilitiesBySeverity).toEqual([
      { severity: "critical", count: 4 },
      { severity: "high", count: 6 },
    ]);
    expect(cc81.evidence.auditedActions).toBe(15);

    expect(selectCount).toBe(8);
  });

  it("BD vacía → conteos a 0 y listas de evidencia vacías", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbResponses = [];

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    const [cc61, cc72, cc73, cc81] = body.pack.controls;
    expect(cc61.evidence).toMatchObject({
      users: 0,
      platformAdmins: 0,
      projectMemberships: 0,
    });
    expect(cc72.evidence.securityEventsByType).toEqual([]);
    expect(cc72.evidence.siemDeliveries).toBe(0);
    expect(cc73.evidence.assessments).toBe(0);
    expect(cc73.evidence.vulnerabilitiesBySeverity).toEqual([]);
    expect(cc81.evidence.auditedActions).toBe(0);
  });

  it("error de BD → 500", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });
    dbFail = true;

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
  });
});
