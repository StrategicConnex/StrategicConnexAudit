import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks: DB directa y schemas
const dbMock = vi.hoisted(() => ({
  query: {
    developerApiKeys: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => ({ returning: vi.fn() })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => ({ catch: vi.fn() })) })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(),
  })),
}));

vi.mock("@/shared/db", () => ({ directDb: dbMock }));
vi.mock("@/shared/db/schemas", () => ({ developerApiKeys: {} }));

import {
  generateApiKeyPair,
  hashApiKey,
  isValidKeyFormat,
  extractBearerToken,
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "./api-keys";

const makeRecord = (over: Record<string, unknown> = {}) => ({
  id: "k_1",
  userId: "u_1",
  name: "CI",
  keyPrefix: "sa_live_ab12cd34",
  hashedKey: "h".repeat(64),
  scope: ["intelligence:read"],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date("2026-01-01"),
  ...over,
});

describe("api-keys — generación y hashing", () => {
  it("generateApiKeyPair produce sa_live_ + 64 hex + hash sha256 + prefix", () => {
    const { rawKey, hashedKey, keyPrefix } = generateApiKeyPair();
    expect(rawKey.startsWith("sa_live_")).toBe(true);
    expect(rawKey.length).toBe("sa_live_".length + 64);
    expect(hashedKey).toMatch(/^[0-9a-f]{64}$/);
    expect(hashedKey).toBe(hashApiKey(rawKey));
    expect(keyPrefix).toBe(rawKey.substring(0, "sa_live_".length + 8));
  });

  it("dos pares generados son distintos", () => {
    expect(generateApiKeyPair().rawKey).not.toBe(generateApiKeyPair().rawKey);
  });

  it("hashApiKey es determinista", () => {
    const raw = "sa_live_" + "a".repeat(64);
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });
});

describe("api-keys — isValidKeyFormat / extractBearerToken", () => {
  it("acepta formato válido", () => {
    expect(isValidKeyFormat("sa_live_" + "a".repeat(64))).toBe(true);
  });

  it("rechaza prefijo incorrecto, longitud o hex inválido", () => {
    expect(isValidKeyFormat("sk_live_" + "a".repeat(64))).toBe(false);
    expect(isValidKeyFormat("sa_live_" + "a".repeat(63))).toBe(false);
    expect(isValidKeyFormat("sa_live_" + "g".repeat(64))).toBe(false);
  });

  it("extractBearerToken extrae el token y rechaza ausencias", () => {
    const req = { headers: { get: (n: string) => (n === "authorization" ? "Bearer sa_live_abc" : null) } };
    expect(extractBearerToken(req)).toBe("sa_live_abc");
    expect(extractBearerToken({ headers: { get: () => null } })).toBeNull();
    expect(extractBearerToken({ headers: { get: () => "Basic abc" } })).toBeNull();
  });
});

describe("api-keys — authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.query.developerApiKeys.findFirst.mockReset();
  });

  const authReq = (token: string) => ({
    headers: { get: () => `Bearer ${token}` },
  });

  it("autentica una key válida y devuelve userId + keyRecord", async () => {
    dbMock.query.developerApiKeys.findFirst.mockResolvedValue(makeRecord());
    const result = await authenticateApiKey(authReq("sa_live_" + "a".repeat(64)));
    expect(result.authenticated).toBe(true);
    expect(result.userId).toBe("u_1");
    expect(result.keyRecord?.scope).toEqual(["intelligence:read"]);
    expect(dbMock.query.developerApiKeys.findFirst).toHaveBeenCalledTimes(1);
  });

  it("rechaza sin token Bearer", async () => {
    const result = await authenticateApiKey({ headers: { get: () => null } });
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Bearer");
  });

  it("rechaza formato inválido sin consultar la DB", async () => {
    const result = await authenticateApiKey(authReq("sa_live_short"));
    expect(result.authenticated).toBe(false);
    expect(dbMock.query.developerApiKeys.findFirst).not.toHaveBeenCalled();
  });

  it("rechaza key no encontrada", async () => {
    dbMock.query.developerApiKeys.findFirst.mockResolvedValue(null);
    const result = await authenticateApiKey(authReq("sa_live_" + "b".repeat(64)));
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rechaza key expirada", async () => {
    dbMock.query.developerApiKeys.findFirst.mockResolvedValue(
      makeRecord({ expiresAt: new Date("2020-01-01") })
    );
    const result = await authenticateApiKey(authReq("sa_live_" + "c".repeat(64)));
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("devuelve error interno si la DB falla (fail-safe)", async () => {
    dbMock.query.developerApiKeys.findFirst.mockRejectedValue(new Error("conn refused"));
    const result = await authenticateApiKey(authReq("sa_live_" + "d".repeat(64)));
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Internal");
  });
});

describe("api-keys — createApiKey / listApiKeys / revokeApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createApiKey devuelve rawKey + record", async () => {
    dbMock.insert.mockImplementationOnce(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => [makeRecord()]) })),
    }));
    const result = await createApiKey("u_1", "CI key", ["intelligence:read"]);
    if ("rawKey" in result) {
      expect(result.rawKey.startsWith("sa_live_")).toBe(true);
      expect(result.record.userId).toBe("u_1");
    } else {
      throw new Error("se esperaba éxito");
    }
  });

  it("createApiKey devuelve error si el insert falla", async () => {
    dbMock.insert.mockImplementationOnce(() => ({
      values: vi.fn(() => ({ returning: vi.fn(async () => { throw new Error("dup"); }) })),
    }));
    const result = await createApiKey("u_1", "CI key");
    expect("error" in result).toBe(true);
  });

  it("listApiKeys mapea los records", async () => {
    dbMock.query.developerApiKeys.findMany.mockResolvedValue([
      makeRecord({ id: "k_1" }),
      makeRecord({ id: "k_2", name: "Prod" }),
    ]);
    const keys = await listApiKeys("u_1");
    expect(keys.length).toBe(2);
    expect(keys[1]!.name).toBe("Prod");
  });

  it("listApiKeys devuelve [] si la DB falla", async () => {
    dbMock.query.developerApiKeys.findMany.mockRejectedValue(new Error("down"));
    expect(await listApiKeys("u_1")).toEqual([]);
  });

  it("revokeApiKey borra y devuelve true; false si la DB falla", async () => {
    dbMock.delete.mockImplementationOnce(() => ({
      where: vi.fn(async () => undefined),
    }));
    expect(await revokeApiKey("k_1", "u_1")).toBe(true);

    dbMock.delete.mockImplementationOnce(() => ({
      where: vi.fn(async () => { throw new Error("down"); }),
    }));
    expect(await revokeApiKey("k_1", "u_1")).toBe(false);
  });
});
