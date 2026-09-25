import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockAuthenticateApiKey = vi.fn();

vi.mock("@/shared/lib/api-keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/api-keys")>();
  return {
    ...actual,
    authenticateApiKey: mockAuthenticateApiKey,
  };
});

const mockInsertValues = vi.fn(() => ({ catch: vi.fn(() => Promise.resolve()) }));

vi.mock("@/shared/db", () => ({
  directDb: {
    insert: vi.fn(() => ({ values: mockInsertValues })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function createRequest(url: string, method = "GET"): NextRequest {
  return new NextRequest(new Request(url, { method }));
}

const keyRecord = (scope: string[]) => ({
  id: "key-1",
  userId: "user-1",
  name: "test-key",
  keyPrefix: "sa_live_",
  scope,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date(),
});

const handler = vi.fn(async () => NextResponse.json({ ok: true }));

beforeEach(() => {
  vi.clearAllMocks();
  handler.mockResolvedValue(NextResponse.json({ ok: true }));
});

describe("withPublicApi — autenticación", () => {
  let withPublicApi: typeof import("./public-router").withPublicApi;

  beforeEach(async () => {
    const mod = await import("./public-router");
    withPublicApi = mod.withPublicApi;
  });

  it("sin API key → 401 con WWW-Authenticate y documentation_url", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: false,
      userId: null,
      error: "Use: Bearer sa_live_<key>",
    });

    const wrapped = withPublicApi(handler);
    const res = await wrapped(createRequest("http://localhost/api/public/v1/reports"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.documentation_url).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("key válida → ejecuta el handler con apiKeyAuth adjunto", async () => {
    const record = keyRecord([]);
    mockAuthenticateApiKey.mockResolvedValue({ authenticated: true, userId: "user-1", keyRecord: record });

    const wrapped = withPublicApi(handler);
    const res = await wrapped(createRequest("http://localhost/api/public/v1/reports"));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0]![0] as { apiKeyAuth?: unknown };
    expect(req.apiKeyAuth).toBeDefined();
  });
});

describe("withPublicApi — enforcement de scope (M-3)", () => {
  let withPublicApi: typeof import("./public-router").withPublicApi;

  beforeEach(async () => {
    const mod = await import("./public-router");
    withPublicApi = mod.withPublicApi;
  });

  it("key sin el scope requerido → 403 con el nombre del scope", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      keyRecord: keyRecord(["reports:read"]),
    });

    const wrapped = withPublicApi(handler, { scope: "intelligence:read" });
    const res = await wrapped(createRequest("http://localhost/api/public/v1/intelligence"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("intelligence:read");
    expect(handler).not.toHaveBeenCalled();
  });

  it("key con el scope requerido → 200", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      keyRecord: keyRecord(["intelligence:read"]),
    });

    const wrapped = withPublicApi(handler, { scope: "intelligence:read" });
    const res = await wrapped(createRequest("http://localhost/api/public/v1/intelligence"));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("key legacy con scope [] → acceso completo (back-compat)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      keyRecord: keyRecord([]),
    });

    const wrapped = withPublicApi(handler, { scope: "intelligence:read" });
    const res = await wrapped(createRequest("http://localhost/api/public/v1/intelligence"));
    expect(res.status).toBe(200);
  });

  it("ruta sin scope declarado → no exige scope aunque la key tenga otros", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      keyRecord: keyRecord(["reports:read"]),
    });

    const wrapped = withPublicApi(handler);
    const res = await wrapped(createRequest("http://localhost/api/public/v1/reports"));
    expect(res.status).toBe(200);
  });

  it("apiKeyHasScope: null key → false; scope presente → true; scope ausente → false", async () => {
    const { apiKeyHasScope } = await import("@/shared/lib/api-keys");
    expect(apiKeyHasScope(null, "intelligence:read")).toBe(false);
    expect(apiKeyHasScope({ scope: ["intelligence:read"] }, "intelligence:read")).toBe(true);
    expect(apiKeyHasScope({ scope: ["reports:read"] }, "intelligence:read")).toBe(false);
    expect(apiKeyHasScope({ scope: [] }, "intelligence:read")).toBe(true);
    expect(apiKeyHasScope({}, "intelligence:read")).toBe(true);
  });
});

describe("withPublicApi — logging de uso", () => {
  let withPublicApi: typeof import("./public-router").withPublicApi;

  beforeEach(async () => {
    const mod = await import("./public-router");
    withPublicApi = mod.withPublicApi;
  });

  it("key autenticada → registra api_key_usage en securityAuditLogs (fire-and-forget)", async () => {
    mockAuthenticateApiKey.mockResolvedValue({
      authenticated: true,
      userId: "user-1",
      keyRecord: keyRecord([]),
    });

    const wrapped = withPublicApi(handler);
    await wrapped(createRequest("http://localhost/api/public/v1/reports", "POST"));

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(values.eventType).toBe("api_key_usage");
    expect(values.userId).toBe("user-1");
    expect(values.path).toBe("/api/public/v1/reports");
    expect(values.method).toBe("POST");
  });
});

describe("apiError / apiSuccess", () => {
  it("apiError → success false y status custom", async () => {
    const { apiError } = await import("./public-router");
    const res = apiError("Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Not found" });
  });

  it("apiError con status por defecto → 400", async () => {
    const { apiError } = await import("./public-router");
    const res = apiError("Bad request");
    expect(res.status).toBe(400);
  });

  it("apiSuccess → success true con data y status 200", async () => {
    const { apiSuccess } = await import("./public-router");
    const res = apiSuccess({ items: [1, 2] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, items: [1, 2] });
  });
});
