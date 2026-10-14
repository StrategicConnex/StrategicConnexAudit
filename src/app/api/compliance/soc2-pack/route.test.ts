/* ═══════════════════════════════════════════════════════════════════════════
   Compliance: SOC 2 evidence pack — Tests de endpoint (Oleada 3)

   withRLS mockeado (autoridad del llamante): la ruta abre sesión Supabase,
   verifica rol admin dentro de withRLS y reúne el pack dentro de otro
   withRLS. Verifica:
   - Sin sesión → 401 sin tocar la BD ni hashear
   - No admin → 403
   - Admin → 200 con hash y 5 controles
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Spies ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockWithRLS = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (...args: unknown[]) => mockWithRLS(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// `withRequestContext` es un HOF: recibe el handler y devuelve el handler.
vi.mock("@/lib/request-context", () => ({
  withRequestContext: <T>(handler: T): T => handler,
}));

vi.mock("@/shared/db/schemas", () => ({
  users: { id: "id", role: "role" },
  projectMembers: { id: "id" },
  securityAuditLogs: { eventType: "eventType", createdAt: "createdAt" },
  siemAlertLogs: { createdAt: "createdAt" },
  adversaryAssessments: { createdAt: "createdAt" },
  adversaryVulnerabilities: { severity: "severity" },
  auditLogs: { createdAt: "createdAt" },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/compliance/soc2-pack${query}`),
  );
}

type GetHandler = (req: NextRequest) => Promise<Response>;

async function loadGet(): Promise<GetHandler> {
  const mod = await import("./route");
  return (mod as unknown as { GET: GetHandler }).GET;
}

const SAMPLE_PACK = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  windowDays: 90,
  controls: [
    { control: "CC6.1", title: "Acceso lógico", evidence: {} },
    { control: "CC7.2", title: "Monitoreo continuo", evidence: {} },
    { control: "CC7.3", title: "Respuesta a incidentes", evidence: {} },
    { control: "CC8.1", title: "Gestión del cambio", evidence: {} },
    { control: "A1.2", title: "Retención", evidence: {} },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/compliance/soc2-pack", () => {
  let GET: GetHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    GET = await loadGet();
  });

  it("sin sesión → 401 sin tocar la BD", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(createRequest() as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("usuario no admin → 403 sin paquete", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockWithRLS.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Prohibido: se requiere rol admin" },
        { status: 403 },
      ),
    });

    const res = await GET(createRequest() as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("admin → 200 con hash y pack de 5 controles", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    // 1ª llamada: chequeo de rol admin → ok. 2ª: armado del pack.
    mockWithRLS
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ pack: SAMPLE_PACK });

    const res = await GET(createRequest() as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Hash real SHA-256 sobre el pack serializado (cadena de custodia).
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.pack).toEqual(SAMPLE_PACK);
    expect(body.pack.controls).toHaveLength(5);

    // Autoridad del llamante: ambas operaciones corren con el id de sesión.
    expect(mockWithRLS).toHaveBeenNthCalledWith(1, "u1", expect.any(Function));
    expect(mockWithRLS).toHaveBeenNthCalledWith(2, "u1", expect.any(Function));
  });
});
