/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Bulk Analysis — Tests de endpoint (TD-03 lote 2)

   Verifica la cadena de seguridad y el insert masivo:
   - API key inválida → 401; scope sin intelligence:write → 403
   - Payload inválido (zod) → 400; rate limit → 429
   - Proyecto no propio → 404
   - ok → 202 con normalización de targets (email/ip/url/domain) y status
     queued; error de BD → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockValidateApiKey = vi.fn();
const mockHasScope = vi.fn();
const mockRateLimit = vi.fn();
const mockFindFirst = vi.fn();
const mockInsert = vi.fn();

let insertedRows: unknown[] | null = null;

vi.mock("@/server/intelligence/enterprise/api-auth", () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock("@/shared/lib/api-keys", () => ({
  apiKeyHasScope: (...args: unknown[]) => mockHasScope(...args),
  API_SCOPES: { intelligenceWrite: "intelligence:write" },
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  checkIntelScanRateLimit: (...args: unknown[]) => mockRateLimit(...args),
  buildRateLimitHeaders: (rl: { retryAfter?: number }) => ({
    "x-ratelimit-reset": String(rl.retryAfter ?? 0),
  }),
}));

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      projects: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  directDb: {},
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/intelligence/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  projectId: "2a7cff00-0000-4000-8000-000000000001",
  targets: ["Example.COM", "user@Host.io", "10.0.0.1", "https://a.example"],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Bulk — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    insertedRows = null;
    mockValidateApiKey.mockResolvedValue({
      userId: "u-1",
      keyId: "k-1",
      scope: ["intelligence:write"],
    });
    mockHasScope.mockReturnValue(true);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 30 });
    mockFindFirst.mockResolvedValue({ id: validBody.projectId });
    mockInsert.mockImplementation(() => ({
      values: (rows: unknown[]) => {
        insertedRows = rows;
        return {
          returning: () =>
            Promise.resolve([
              { id: "i1", target: "Example.COM" },
              { id: "i2", target: "user@Host.io" },
            ]),
        };
      },
    }));
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin API key válida → 401", async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("scope sin intelligence:write → 403", async () => {
    mockHasScope.mockReturnValue(false);

    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("intelligence:write");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("payload inválido (zod) → 400", async () => {
    const res = await POST(
      createRequest({ projectId: "not-a-uuid", targets: [] }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid payload");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rate limit agotado → 429 con cabecera de reset", async () => {
    mockRateLimit.mockResolvedValue({ success: false, retryAfter: 42 });

    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(429);
    expect(res.headers.get("x-ratelimit-reset")).toBe("42");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("proyecto no encontrado/no propio → 404", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found or access denied.");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("ok → 202 con targets normalizados y status queued", async () => {
    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("2 investigations queued for processing.");
    expect(body.investigations).toHaveLength(2);

    expect(insertedRows).toHaveLength(4);
    const rows = insertedRows as Array<{
      target: string;
      normalizedTarget: string;
      targetType: string;
      status: string;
      ownerId: string;
      title: string;
    }>;
    expect(rows[0]).toMatchObject({
      target: "Example.COM",
      normalizedTarget: "example.com",
      targetType: "domain",
      status: "queued",
      ownerId: "u-1",
    });
    expect(rows.map((r) => r.targetType)).toEqual([
      "domain",
      "email",
      "ip",
      "url",
    ]);
    expect(rows.every((r) => r.title.startsWith("Bulk Analysis:"))).toBe(true);
  });

  it("límite de 50 targets validado por zod (51 → 400)", async () => {
    const tooMany = {
      projectId: validBody.projectId,
      targets: Array.from({ length: 51 }, (_, i) => `t${i}.example`),
    };

    const res = await POST(createRequest(tooMany) as never);
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("error de BD en el insert → 500", async () => {
    mockInsert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error("insert failed")),
      }),
    }));

    const res = await POST(createRequest(validBody) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
  });
});
