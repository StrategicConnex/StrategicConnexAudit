/* ═══════════════════════════════════════════════════════════════════════════
   Public API v1: Intelligence — Tests de endpoint (P0)

   Verifica el wrapper withPublicApi + handlers GET/POST:
   - 401 sin API key válida
   - GET: detalle por investigationId (404 si no existe), listado por
     projectId, 400 sin projectId
   - POST: validación del body (400), ownership del proyecto (404),
     rate limit (429), creación de investigation + scan en background (200)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAuthenticateApiKey = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockInvFindFirst = vi.fn();
const mockInvFindMany = vi.fn();
const mockFindingsFindMany = vi.fn();
const mockAssetsFindMany = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockUpdateWhere = vi.fn(async () => {});
const mockExecuteTool = vi.fn();
const mockCalculateRiskScore = vi.fn();

vi.mock("@/shared/lib/api-keys", () => ({
  authenticateApiKey: mockAuthenticateApiKey,
  apiKeyHasScope: vi.fn(() => true),
  API_SCOPES: { intelligenceRead: "intelligence:read", intelligenceWrite: "intelligence:write" },
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  checkIntelScanRateLimit: mockCheckRateLimit,
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      intelligenceInvestigations: {
        findFirst: mockInvFindFirst,
        findMany: mockInvFindMany,
      },
      intelligenceFindings: { findMany: mockFindingsFindMany },
      intelligenceAssets: { findMany: mockAssetsFindMany },
      projects: { findFirst: mockProjectFindFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockReturning,
        catch: vi.fn(() => Promise.resolve()),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateWhere })) })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", ownerId: "ownerId" },
  intelligenceInvestigations: {
    id: "id",
    projectId: "projectId",
    createdAt: "createdAt",
  },
  intelligenceFindings: { investigationId: "investigationId" },
  intelligenceAssets: { investigationId: "investigationId" },
  securityAuditLogs: {},
}));

vi.mock("@/server/intelligence/core/dispatcher", () => ({
  executeTool: mockExecuteTool,
}));

vi.mock("@/server/intelligence/core/risk-engine", () => ({
  calculateRiskScore: mockCalculateRiskScore,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const authenticatedAuth = {
  authenticated: true,
  userId: "user-1",
  keyRecord: {
    id: "key-1",
    userId: "user-1",
    name: "test-key",
    keyPrefix: "sa_live_",
    scope: ["intelligence"],
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
  },
};

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

const validPost = {
  target: "example.com",
  projectId: "123e4567-e89b-12d3-a456-426614174000",
};

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("Public API v1: Intelligence — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin API key válida → 401", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: false,
      userId: null,
      error: "Use: Bearer sa_live_<key>",
    });

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence?projectId=p1")
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.documentation_url).toBeDefined();
  });

  it("detalle por investigationId → 200 con counts de findings y assets", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockInvFindFirst.mockResolvedValue({ id: "inv-1", projectId: "p1", ownerId: "user-1", status: "completed", score: 42 });
    mockFindingsFindMany.mockResolvedValue([{ id: "f1" }, { id: "f2" }]);
    mockAssetsFindMany.mockResolvedValue([{ id: "a1" }]);

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence?investigationId=inv-1")
    );
    expect(res.status).toBe(200);
    // La query usa el investigationId del query param
    expect(mockInvFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindingsFindMany).toHaveBeenCalledTimes(1);
    expect(mockAssetsFindMany).toHaveBeenCalledTimes(1);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigation.id).toBe("inv-1");
    expect(body.findings).toBe(2);
    expect(body.assets).toBe(1);
    expect(body.data.investigation.id).toBe("inv-1");
  });

  it("investigationId inexistente → 404", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockInvFindFirst.mockResolvedValue(null);

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence?investigationId=nope")
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Investigation not found");
  });

  it("sin projectId ni investigationId → 400", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectId is required");
  });

  it("listado por projectId → 200", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    // Ownership check del proyecto (SECURITY): debe pertenecer al dueño de la key
    mockProjectFindFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mockInvFindMany.mockResolvedValue([{ id: "inv-1" }, { id: "inv-2" }]);

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence?projectId=p1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigations).toHaveLength(2);
  });

  it("projectId de OTRO dueño → 404 (no lista investigaciones ajenas)", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockProjectFindFirst.mockResolvedValue({ id: "p1", ownerId: "otro-user" });

    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/public/v1/intelligence?projectId=p1")
    );
    expect(res.status).toBe(404);
    expect(mockInvFindMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("Public API v1: Intelligence — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin API key válida → 401", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: false,
      userId: null,
      error: "Use: Bearer sa_live_<key>",
    });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", validPost)
    );
    expect(res.status).toBe(401);
  });

  it("body inválido (falta projectId) → 400", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", { target: "example.com" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid arguments");
  });

  it("proyecto no perteneciente al usuario → 404", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockProjectFindFirst.mockResolvedValue(null);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", validPost)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Project not found or access denied");
  });

  it("rate limit superado → 429", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockProjectFindFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mockCheckRateLimit.mockResolvedValue({ success: false });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", validPost)
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("rate limit");
  });

  it("escaneo exitoso → 200, inserta investigation y lanza scan en background", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockProjectFindFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockReturning.mockResolvedValue([{
      id: "inv-new",
      projectId: "p1",
      ownerId: "user-1",
      title: "Auditoria de Infraestructura para example.com",
      target: "example.com",
      normalizedTarget: "example.com",
      targetType: "domain",
      status: "running",
      createdAt: new Date(),
    }]);
    mockExecuteTool.mockResolvedValue({ findings: [{ severity: "info", title: "ok" }] });
    mockCalculateRiskScore.mockReturnValue({ score: 50 });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", {
        target: "https://example.com",
        projectId: "123e4567-e89b-12d3-a456-426614174000",
      })
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.investigation.status).toBe("running");
    // Normalización: https://example.com → example.com (domain)
    expect(body.investigation.normalizedTarget).toBe("example.com");
    expect(body.investigation.targetType).toBe("domain");

    // El scan en background dispara executeTool sobre todos los tools
    await vi.waitFor(() => expect(mockExecuteTool).toHaveBeenCalled());
    expect(mockExecuteTool.mock.calls.length).toBeGreaterThanOrEqual(21);
    // ... y actualiza el investigation a completed
    await vi.waitFor(() => expect(mockUpdateWhere).toHaveBeenCalled());
  });

  it("scan en background resiliente: si executeTool falla por tool, la investigation se completa igual", async () => {
    mockAuthenticateApiKey.mockResolvedValue(authenticatedAuth);
    mockProjectFindFirst.mockResolvedValue({ id: "p1", ownerId: "user-1" });
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockReturning.mockResolvedValue([{
      id: "inv-resilient",
      projectId: "p1",
      ownerId: "user-1",
      title: "Auditoria",
      target: "example.com",
      normalizedTarget: "example.com",
      targetType: "domain",
      status: "running",
      createdAt: new Date(),
    }]);
    // Todos los tools fallan → el background los captura individualmente
    mockExecuteTool.mockRejectedValue(new Error("tool unavailable"));
    mockCalculateRiskScore.mockReturnValue({ score: 0 });

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/public/v1/intelligence", validPost)
    );
    expect(res.status).toBe(200);

    // El scan igualmente completa la investigation (no queda colgada en running)
    await vi.waitFor(() => expect(mockExecuteTool).toHaveBeenCalled());
    await vi.waitFor(() => expect(mockUpdateWhere).toHaveBeenCalled());
    expect(mockCalculateRiskScore).toHaveBeenCalled();
  });
});
