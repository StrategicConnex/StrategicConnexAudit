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
    // En desarrollo sin Redis retorna success con el limit configurado
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(5);
    // Constructor should NOT be called (no Redis configured)
    expect(mockLimit).not.toHaveBeenCalled();
  }, 10000);

  it("fail-closed en produccion sin Redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");
    const result = await mod.checkAiRateLimit("user-2");
    expect(result.success).toBe(false);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(0);
    // Constructor should NOT be called (no Redis configured)
    expect(mockLimit).not.toHaveBeenCalled();
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
