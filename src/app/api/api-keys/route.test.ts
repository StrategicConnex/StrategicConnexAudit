import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockListApiKeys = vi.fn();
const mockCreateApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockIsValidApiScope = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/lib/api-keys", () => ({
  listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  isValidApiScope: (...args: unknown[]) => mockIsValidApiScope(...args),
  API_SCOPES: {
    intelligenceRead: "intelligence:read",
    intelligenceWrite: "intelligence:write",
    reportsRead: "reports:read",
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, path: string, body?: unknown): NextRequest {
  const url = `http://localhost:3000/api/api-keys${path}`;
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/api-keys", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("GET", ""));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("No autorizado");
  });

  it("returns keys for authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockListApiKeys.mockResolvedValue([
      { id: "k1", name: "Test Key", keyPrefix: "sa_live_", scope: [], createdAt: new Date() },
    ]);

    const res = await GET(createRequest("GET", ""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.keys).toHaveLength(1);
    expect(mockListApiKeys).toHaveBeenCalledWith("u1");
  });

  it("returns 500 on internal error", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));
    const res = await GET(createRequest("GET", ""));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
  });
});

describe("POST /api/api-keys", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(createRequest("POST", "", { name: "key1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid (missing name)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createRequest("POST", "", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("returns 400 when name is empty", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createRequest("POST", "", { name: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds max length", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createRequest("POST", "", { name: "a".repeat(65) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresAt is in the past", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createRequest("POST", "", {
      name: "key",
      expiresAt: "2020-01-01T00:00:00.000Z",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when scope contains invalid values", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsValidApiScope.mockReturnValue(false);
    const res = await POST(createRequest("POST", "", {
      name: "key",
      scope: ["invalid:scope"],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid scope");
  });

  it("creates key with valid data and no expiresAt", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsValidApiScope.mockReturnValue(true);
    mockCreateApiKey.mockResolvedValue({
      rawKey: "sa_live_abc123",
      record: { id: "k1", name: "key", keyPrefix: "sa_live_", scope: [], createdAt: new Date() },
    });

    const res = await POST(createRequest("POST", "", { name: "key" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rawKey).toBe("sa_live_abc123");
  });

  it("creates key with valid expiresAt", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsValidApiScope.mockReturnValue(true);
    mockCreateApiKey.mockResolvedValue({
      rawKey: "sa_live_def456",
      record: { id: "k2", name: "expiring", keyPrefix: "sa_live_", scope: ["intelligence:read"], createdAt: new Date() },
    });

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await POST(createRequest("POST", "", { name: "expiring", expiresAt: futureDate, scope: ["intelligence:read"] }));
    expect(res.status).toBe(200);
    expect(mockCreateApiKey).toHaveBeenCalled();
  });

  it("returns 500 when createApiKey returns error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsValidApiScope.mockReturnValue(true);
    mockCreateApiKey.mockResolvedValue({ error: "Failed to create API key" });

    const res = await POST(createRequest("POST", "", { name: "key" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create API key");
  });

  it("returns 500 on internal error", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));
    const res = await POST(createRequest("POST", "", { name: "key" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
  });

  it("returns 400 when scope array has too many items", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(createRequest("POST", "", {
      name: "key",
      scope: new Array(17).fill("intelligence:read"),
    }));
    expect(res.status).toBe(400);
  });

  it("creates key with empty scope array (default)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsValidApiScope.mockReturnValue(true);
    mockCreateApiKey.mockResolvedValue({
      rawKey: "sa_live_ghi789",
      record: { id: "k3", name: "noscope", keyPrefix: "sa_live_", scope: [], createdAt: new Date() },
    });

    const res = await POST(createRequest("POST", "", { name: "noscope", scope: [] }));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/api-keys", () => {
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(createRequest("DELETE", "?id=k1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await DELETE(createRequest("DELETE", ""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Key ID is required");
  });

  it("revokes key successfully", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockRevokeApiKey.mockResolvedValue(true);
    const res = await DELETE(createRequest("DELETE", "?id=k1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("API key revoked");
    expect(mockRevokeApiKey).toHaveBeenCalledWith("k1", "u1");
  });

  it("returns 404 when key not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockRevokeApiKey.mockResolvedValue(false);
    const res = await DELETE(createRequest("DELETE", "?id=nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 500 on internal error", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));
    const res = await DELETE(createRequest("DELETE", "?id=k1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
  });
});
