import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedisInstance = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock("@upstash/redis", () => {
  return {
    Redis: class MockRedis {
      constructor() {
        return mockRedisInstance as never;
      }
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { cached } from "./cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cached()", () => {
  it("calls fn on cache miss", async () => {
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue("OK");
    const fn = vi.fn(async () => "result");
    const result = await cached("key", 60, fn);
    expect(result).toBe("result");
    expect(fn).toHaveBeenCalled();
    expect(mockRedisInstance.set).toHaveBeenCalledWith("key", "result", {
      ex: 60,
    });
  });

  it("returns cached value on hit", async () => {
    mockRedisInstance.get.mockResolvedValue("cached");
    const fn = vi.fn(async () => "result");
    const result = await cached("key", 60, fn);
    expect(result).toBe("cached");
    expect(fn).not.toHaveBeenCalled();
  });

  it("handles complex objects", async () => {
    const data = { items: [1, 2, 3], total: 3 };
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.set.mockResolvedValue("OK");
    const fn = vi.fn(async () => data);
    const result = await cached("complex", 30, fn);
    expect(result).toEqual(data);
  });
});
