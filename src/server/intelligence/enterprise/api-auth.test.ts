/* ═══════════════════════════════════════════════════════════════════════════
   api-auth — Tests de validación de API keys públicas (RULE-007 v3.1)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      developerApiKeys: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({ catch: (fn: (e: unknown) => void) => fn(new Error("noop")) }),
      }),
    }),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  developerApiKeys: {
    hashedKey: "hashedKey",
    id: "id",
    userId: "userId",
    expiresAt: "expiresAt",
    lastUsedAt: "lastUsedAt",
  },
}));

// ─── Helper ─────────────────────────────────────────────────────────────────

function createRequest(authHeader: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new NextRequest(new Request("http://localhost:3000/api/public/v1/intelligence", { headers }));
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("validateApiKey", () => {
  let validateApiKey: typeof import("./api-auth").validateApiKey;

  beforeEach(async () => {
    vi.clearAllMocks();
    validateApiKey = (await import("./api-auth")).validateApiKey;
  });

  it("retorna null sin header Authorization", async () => {
    expect(await validateApiKey(createRequest(null))).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("retorna null con header que no empieza por Bearer", async () => {
    expect(await validateApiKey(createRequest("Basic dXNlcjpwYXNz"))).toBeNull();
  });

  it("retorna null con Bearer vacío", async () => {
    expect(await validateApiKey(createRequest("Bearer "))).toBeNull();
  });

  it("busca por el hash SHA-256 del token (nunca el token en claro)", async () => {
    mockFindFirst.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      expiresAt: null,
    });

    const rawKey = "sa_live_1234567890";
    const result = await validateApiKey(createRequest(`Bearer ${rawKey}`));

    expect(result).toEqual({ userId: "user-1", keyId: "key-1" });
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    // Verificar que la query use el hash, no el token en claro
    const whereArg = mockFindFirst.mock.calls[0][0].where;
    const whereClause = JSON.stringify(whereArg);
    expect(whereClause).toContain(sha256(rawKey));
    expect(whereClause).not.toContain(rawKey);
  });

  it("retorna null si no existe la key", async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await validateApiKey(createRequest("Bearer sa_live_inexistente"))).toBeNull();
  });

  it("retorna null si la key está expirada", async () => {
    mockFindFirst.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await validateApiKey(createRequest("Bearer sa_live_expirada"))).toBeNull();
  });

  it("acepta key sin expiración", async () => {
    mockFindFirst.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      expiresAt: null,
    });
    const result = await validateApiKey(createRequest("Bearer sa_live_sin_exp"));
    expect(result?.userId).toBe("user-1");
  });

  it("retorna null ante error de BD (fail-closed)", async () => {
    mockFindFirst.mockRejectedValue(new Error("db down"));
    expect(await validateApiKey(createRequest("Bearer sa_live_x"))).toBeNull();
  });
});
