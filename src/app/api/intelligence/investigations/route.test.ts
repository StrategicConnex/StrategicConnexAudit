/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence Investigations — Tests de endpoint

   Verifica los handlers GET/POST con RLS simulado (passthrough):
   - GET: listado por projectId (200), detalle por investigationId (404 si
     RLS no devuelve fila), contrato del agregado findings
   - POST: validación del body (400), creación + scan en background (200)
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
    getCurrentUserOrThrow: vi.fn(),
    checkIntelScanRateLimit: vi.fn(),
    assertPublicHostname: vi.fn(),
    executeTool: vi.fn(),
    calculateRiskScore: vi.fn(),
  };
});

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
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

vi.mock("@/server/intelligence/core/risk-engine", () => ({
  calculateRiskScore: mocks.calculateRiskScore,
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

function mockInsertChain(returningResults: Array<Record<string, unknown> | null>) {
  let callIndex = 0;
  mocks.tx.insert.mockImplementation(() => ({
    values: vi.fn(() => {
      const row = returningResults[callIndex++] ?? null;
      return {
        returning: vi.fn(async () => (row ? [row] : [])),
        onConflictDoUpdate: vi.fn(async () => {}),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
      };
    }),
  }));
  mocks.tx.update.mockImplementation(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
  }));
}

const findingFixture = {
  toolId: "dns.lookup",
  severity: "low",
  confidence: "0.8",
  title: "Hallazgo de prueba",
  description: "Descripción de prueba",
  scoreImpact: 5,
};

const investigationRow = {
  id: "inv-new",
  projectId: "123e4567-e89b-12d3-a456-426614174000",
  ownerId: "user-1",
  title: "Auditoría de Infraestructura para example.com",
  target: "example.com",
  normalizedTarget: "example.com",
  targetType: "domain",
  status: "running",
  score: null,
  createdAt: new Date(),
};

const validPost = {
  target: "example.com",
  projectId: "123e4567-e89b-12d3-a456-426614174000",
};

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("Intelligence Investigations — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("listado por projectId → 200", async () => {
    mocks.tx.query.intelligenceInvestigations.findMany.mockResolvedValue([
      { id: "inv-1", status: "completed", score: 42 },
      { id: "inv-2", status: "failed", score: null },
    ]);

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/intelligence/investigations?projectId=p1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigations).toHaveLength(2);
  });

  it("detalle por investigationId → 200 con contrato del agregado de findings", async () => {
    mocks.tx.query.intelligenceInvestigations.findFirst.mockResolvedValue({
      id: "inv-det",
      status: "completed",
      score: 42,
    });
    mocks.tx.query.intelligenceFindings.findMany.mockResolvedValue([
      { id: "f1", severity: "high", confidence: "0.800" },
    ]);
    mocks.tx.query.intelligenceRunEvents.findMany.mockResolvedValue([]);
    mocks.tx.query.intelligenceAssets.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest(
        "GET",
        "http://localhost:3000/api/intelligence/investigations?investigationId=inv-det"
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigation.id).toBe("inv-det");
    expect(body.findings[0]).toMatchObject({
      severity: expect.any(String),
      confidence: expect.anything(),
    });
  });

  it("detalle por investigationId inexistente (RLS sin fila) → 404", async () => {
    mocks.tx.query.intelligenceInvestigations.findFirst.mockResolvedValue(undefined);

    const res = await GET(
      createRequest(
        "GET",
        "http://localhost:3000/api/intelligence/investigations?investigationId=nope"
      )
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("no encontrada");
  });

  it("sin projectId ni investigationId → 400", async () => {
    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/intelligence/investigations")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("proyecto");
  });
});

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("Intelligence Investigations — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("body inválido (falta projectId) → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence/investigations", {
        target: "example.com",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Argumentos inválidos");
  });

  it("escaneo válido → 200 running y el background persiste hallazgos tipados", async () => {
    mocks.checkIntelScanRateLimit.mockResolvedValue({ success: true });
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mocks.assertPublicHostname.mockResolvedValue(undefined);
    mockInsertChain([investigationRow, { id: "run-1", toolId: "dns.lookup" }]);
    mocks.executeTool.mockResolvedValue({
      success: true,
      output: { A: ["1.2.3.4"] },
      findings: [findingFixture],
      error: null,
    });
    mocks.calculateRiskScore.mockReturnValue({
      score: 60,
      aggregatedFindings: [findingFixture],
    });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence/investigations", validPost)
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigation.status).toBe("running");
    expect(body.investigation.id).toBe("inv-new");

    // El scan en background ejecuta las tools y consolida en DB
    await vi.waitFor(() => expect(mocks.executeTool).toHaveBeenCalled());
    expect(mocks.calculateRiskScore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ toolId: "dns.lookup", severity: "low" }),
      ])
    );
    await vi.waitFor(() => expect(mocks.tx.update).toHaveBeenCalled());
  });

  it("scan resiliente: tools fallando igual completan la investigación", async () => {
    mocks.checkIntelScanRateLimit.mockResolvedValue({ success: true });
    mocks.tx.query.projects.findFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mocks.assertPublicHostname.mockResolvedValue(undefined);
    mockInsertChain([investigationRow, null]);
    mocks.executeTool.mockRejectedValue(new Error("tool unavailable"));
    mocks.calculateRiskScore.mockReturnValue({ score: 0, aggregatedFindings: [] });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/intelligence/investigations", validPost)
    );
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(mocks.executeTool).toHaveBeenCalled());
    await vi.waitFor(() => expect(mocks.tx.update).toHaveBeenCalled());
  });
});
