import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Shared mock that persists across module resets
const mockLimit = vi.fn();

vi.mock("@upstash/ratelimit", () => {
  // Use class syntax for constructable mock
  const RatelimitMock = class {
    limit: typeof mockLimit;
    constructor(opts: { limiter?: { limit: typeof mockLimit } }) {
      this.limit = opts?.limiter?.limit ?? mockLimit;
    }
    static slidingWindow = vi.fn(() => ({ limit: mockLimit }));
  };
  return { Ratelimit: RatelimitMock };
});

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({})),
}));

// ─── Test: checkAiRateLimit ─────────────────────────────────────────────────

describe("checkAiRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Clear module cache so _aiRateLimitInstance singleton resets between tests
    vi.resetModules();
  });

  it("fail-open en desarrollo sin Redis", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mod = await import("./ratelimit");
    const result = await mod.checkAiRateLimit("user-1");
    // En desarrollo sin Redis retorna success vía fallback en memoria
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4); // la llamada actual se registra en memoria
    // Constructor should NOT be called (no Redis configured)
    expect(mockLimit).not.toHaveBeenCalled();
  }, 10000);

  it("fallback en memoria en produccion sin Redis (nunca fail-closed masivo)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");
    // Sin Redis configurado: la app NO debe bloquearse con 429 masivos
    const result = await mod.checkAiRateLimit("user-2");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4); // primera llamada registrada en memoria
    // Constructor should NOT be called (no Redis configured)
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("fallback en memoria aplica el limite por identificador cuando se agota", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");
    // Consumir el límite de 5 del usuario user-mem
    for (let i = 0; i < 5; i++) {
      const ok = await mod.checkAiRateLimit("user-mem");
      expect(ok.success).toBe(true);
    }
    // La sexta llamada en la misma ventana debe ser rechazada
    const blocked = await mod.checkAiRateLimit("user-mem");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    // Otro identificador NO debe verse afectado (ventanas separadas)
    const other = await mod.checkAiRateLimit("user-mem-2");
    expect(other.success).toBe(true);
  });

  it("fallback en memoria degrada cuando Redis esta caido (catch path)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://dead-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    // Simular Redis caído: el limiter lanza
    mockLimit.mockRejectedValue(new Error("ENOTFOUND dead-redis.upstash.io"));

    const mod = await import("./ratelimit");
    const result = await mod.checkAiRateLimit("user-redis-down");

    // Degradación graciosa: success=true vía fallback en memoria
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
  });

  it("success=true con Redis y rate limit no excedido", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://valid-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    mockLimit.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });

    const mod = await import("./ratelimit");
    const result = await mod.checkAiRateLimit("user-3");

    expect(result.success).toBe(true);
    // Verify the Upstash rate limit was called with the correct user ID
    expect(mockLimit).toHaveBeenCalledWith("user-3");
  });

  it("success=false cuando se excede el limite (simula 429)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://valid-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    mockLimit.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const mod = await import("./ratelimit");
    const result = await mod.checkAiRateLimit("user-4");

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("rate limit es por usuario (alice y bob tienen limites separados)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://valid-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");

    mockLimit.mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    mockLimit.mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });

    const mod = await import("./ratelimit");
    const r1 = await mod.checkAiRateLimit("alice");
    const r2 = await mod.checkAiRateLimit("bob");

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(mockLimit).toHaveBeenCalledTimes(2);
    expect(mockLimit).toHaveBeenNthCalledWith(1, "alice");
    expect(mockLimit).toHaveBeenNthCalledWith(2, "bob");
  });
});

// ─── Test: isEmailAllowlisted ───────────────────────────────────────────────

describe("isEmailAllowlisted", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve true para el email hardcodeado en la allowlist", async () => {
    const mod = await import("./ratelimit");
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
  });

  it("normaliza mayusculas y espacios antes de comparar", async () => {
    const mod = await import("./ratelimit");
    // Con espacios alrededor y mayúsculas mixtas
    expect(mod.isEmailAllowlisted("  PALACIOS_JUAN@Hotmail.COM  ")).toBe(true);
    expect(mod.isEmailAllowlisted("Palacios_Juan@hotmail.com")).toBe(true);
  });

  it("respeta AUTH_EMAIL_ALLOWLIST con multiples emails separados por coma", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", " admin@corp.com ,  otro@test.io ");
    const mod = await import("./ratelimit");

    // Emails de la env var (con y sin espacios/case)
    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("OTRO@test.io")).toBe(true);
    // El hardcodeado sigue funcionando junto a la env var
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
    // Email fuera de ambas listas
    expect(mod.isEmailAllowlisted("nobody@example.com")).toBe(false);
  });

  it("ignora entradas vacias de AUTH_EMAIL_ALLOWLIST (comas dobles o espacios)", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", " , , admin@corp.com , ");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
    expect(mod.isEmailAllowlisted("other@corp.com")).toBe(false);
  });

  it("normaliza mayusculas tambien en los valores de AUTH_EMAIL_ALLOWLIST", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", "Admin@Corp.com,  OTRO@TEST.IO ");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("otro@test.io")).toBe(true);
  });

  it("devuelve false para email vacio, null o undefined", async () => {
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("")).toBe(false);
    expect(mod.isEmailAllowlisted("   ")).toBe(false);
    expect(mod.isEmailAllowlisted(null)).toBe(false);
    expect(mod.isEmailAllowlisted(undefined)).toBe(false);
  });

  it("email vacio devuelve false incluso con AUTH_EMAIL_ALLOWLIST configurada (early-return)", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", "admin@corp.com");
    const mod = await import("./ratelimit");

    // El guard !email se ejecuta antes de leer la env var
    expect(mod.isEmailAllowlisted("")).toBe(false);
    expect(mod.isEmailAllowlisted(null)).toBe(false);
  });

  it("devuelve false para emails no listados sin env var configurada", async () => {
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("random@user.com")).toBe(false);
    expect(mod.isEmailAllowlisted("PALACIOS@hotmail.com")).toBe(false); // no es el email exacto
  });
});
