/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence — Tests de endpoint

   Verifica los handlers GET/POST con RLS y autenticación simuladas:
   - GET: listado por projectId, detalle por investigationId, errores
   - POST: validación de body, rate limiting, SSRF guard, scan completo
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const tx = {
    query: {
      projects: { findFirst: vi.fn() },
      intelligenceInvestigations: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      intelligenceFindings: { findMany: vi.fn() },
      intelligenceRunEvents: { findMany: vi.fn() },
      intelligenceAssets: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    tx,
    createClient: vi.fn(),
    withRLS: vi.fn(),
    checkIntelScanRateLimit: vi.fn(),
    assertPublicHostname: vi.fn(),
    executeTool: vi.fn(),
    isKnownTool: vi.fn(),
    listToolDefinitions: vi.fn(),
    calculateRiskScore: vi.fn(),
  };
});

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, fn: (tx: typeof mocks.tx) => unknown) =>
    fn(mocks.tx),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  checkIntelScanRateLimit: mocks.checkIntelScanRateLimit,
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: mocks.assertPublicHostname,
}));

vi.mock("@/server/intelligence/core/dispatcher", () => ({
  executeTool: mocks.executeTool,
}));

vi.mock("@/server/intelligence/core/tool-registry", () => ({
  isKnownTool: mocks.isKnownTool,
  listToolDefinitions: mocks.listToolDefinitions,
}));

vi.mock("@/server/intelligence/core/risk-engine", () => ({
  calculateRiskScore: mocks.calculateRiskScore,
}));

vi.mock("@/server/intelligence/core/scan-response", () => ({
  buildResultMap: vi.fn(() => ({})),
  getPrimaryIp: vi.fn(() => null),
  buildScanResponse: vi.fn((args) => ({
    success: true,
    investigation: args.investigation,
    score: args.score,
    findings: args.aggregatedFindings,
  })),
  buildScanMetadata: vi.fn(() => ({})),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

function mockSupabaseUser(userId: string | null) {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
      })),
    },
  });
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const INVESTIGATION_ID = "f1a2b3c4-d5e6-7890-abcd-ef1234567890";

const investigationRow = {
  id: INVESTIGATION_ID,
  projectId: PROJECT_ID,
  ownerId: "user-1",
  title: "Auditoría example.com",
  target: "example.com",
  normalizedTarget: "example.com",
  targetType: "domain",
  status: "completed",
  score: 75,
  createdAt: new Date(),
};

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("Intelligence — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("GET sin autenticación → 401", async () => {
    mockSupabaseUser(null);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/intelligence?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET por projectId válido → 200 con investigations", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.intelligenceInvestigations.findMany.mockResolvedValue([
      { id: "inv-1", status: "completed", score: 75 },
      { id: "inv-2", status: "failed", score: null },
    ]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/intelligence?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigations).toHaveLength(2);
  });

  it("GET sin projectId ni investigationId → 400", async () => {
    mockSupabaseUser("user-1");

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/intelligence")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("proyecto");
  });

  it("GET projectId no UUID → 400", async () => {
    mockSupabaseUser("user-1");

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/intelligence?projectId=not-a-uuid")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("inválido");
  });

  it("GET por investigationId válido → 200 con detalle", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.intelligenceInvestigations.findFirst.mockResolvedValue(investigationRow);
    mocks.tx.query.intelligenceFindings.findMany.mockResolvedValue([]);
    mocks.tx.query.intelligenceRunEvents.findMany.mockResolvedValue([]);
    mocks.tx.query.intelligenceAssets.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/intelligence?investigationId=${INVESTIGATION_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigation.id).toBe(INVESTIGATION_ID);
  });

  it("GET investigationId inexistente → 404", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.intelligenceInvestigations.findFirst.mockResolvedValue(undefined);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/intelligence?investigationId=nonexistent`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no encontrada");
  });

  it("GET error interno → 500", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.intelligenceInvestigations.findMany.mockRejectedValue(
      new Error("DB connection failed")
    );

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/intelligence?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Error interno");
  });
});

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("Intelligence — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  const validBody = {
    target: "example.com",
    projectId: PROJECT_ID,
  };

  it("POST sin autenticación → 401", async () => {
    mockSupabaseUser(null);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", validBody)
    );
    expect(res.status).toBe(401);
  });

  it("POST body inválido (falta target) → 400", async () => {
    mockSupabaseUser("user-1");

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", {
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("inválidos");
  });

  it("POST proyecto no encontrado → 404", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", validBody)
    );
    expect(res.status).toBe(404);
  });

  it("POST rate limit excedido → 429", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.checkIntelScanRateLimit.mockResolvedValue({ success: false });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", validBody)
    );
    expect(res.status).toBe(429);
  });

  it("POST SSRF guard rechaza host privado → 403", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.checkIntelScanRateLimit.mockResolvedValue({ success: true });
    mocks.assertPublicHostname.mockRejectedValue(new Error("Host privado no permitido"));

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", {
        target: "192.168.1.1",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(403);
  });

  it("POST scan exitoso con herramientas → 200", async () => {
    mockSupabaseUser("user-1");
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.checkIntelScanRateLimit.mockResolvedValue({ success: true });
    mocks.assertPublicHostname.mockResolvedValue(undefined);

    const investigationResult = { ...investigationRow, status: "running" };
    mocks.tx.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [investigationResult]),
        onConflictDoUpdate: vi.fn(async () => {}),
      })),
    });
    mocks.tx.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
    });

    mocks.listToolDefinitions.mockReturnValue([
      { id: "dns.lookup", category: "network" },
    ]);
    mocks.isKnownTool.mockReturnValue(true);
    mocks.executeTool.mockResolvedValue({
      success: true,
      output: { A: ["1.2.3.4"] },
      findings: [],
      error: null,
    });
    mocks.calculateRiskScore.mockReturnValue({ score: 80, aggregatedFindings: [] });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", validBody)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("POST body vacío → 400", async () => {
    mockSupabaseUser("user-1");

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence", {})
    );
    expect(res.status).toBe(400);
  });
});
