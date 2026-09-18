import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _eqVal: val })),
  and: vi.fn((..._args: unknown[]) => ({ _and: true })),
  desc: vi.fn((col: unknown) => ({ _desc: col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _sql: strings.join("?"),
      _values: values,
    }),
    { raw: (s: string) => ({ _raw: s }) }
  ),
}));

const mockChain = vi.hoisted(() => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  return chain;
});

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: typeof mockChain) => Promise<unknown>) => cb(mockChain)),
}));

vi.mock("@/server/ai/ai-router", () => ({
  callAIWithFallback: vi.fn(),
}));

import { generateSeoReport } from "./seo-report-service";
import { withRLS } from "@/shared/db/rls";
import { callAIWithFallback } from "@/server/ai/ai-router";

let thenCallCount = 0;
let thenResults: unknown[] = [];

function setupThenResults(results: unknown[]) {
  thenResults = results;
  thenCallCount = 0;
  mockChain.then.mockImplementation((resolve: (val: unknown) => void) => {
    resolve(thenResults[thenCallCount++] ?? []);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  thenCallCount = 0;
  thenResults = [];
  mockChain.then.mockImplementation((resolve: (val: unknown) => void) => resolve([]));
});

describe("generateSeoReport", () => {
  it("returns 404 when project not found", async () => {
    setupThenResults([[]]);
    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("returns AI report when callAIWithFallback succeeds", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "Test", domain: "test.com", ownerId: "user-1" }],
      [{ clicks: 100, impressions: 5000, ctr: 0.02, position: 3.5 }],
      [{ activeUsers: 50, conversions: 5, engagementRate: 0.8 }],
      [{ status: "completed" }],
      [{ count: 25 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: true,
      content: "# Reporte SEO\nContenido generado",
      modelUsed: "gpt-4",
      fromCache: false,
    });

    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report).toContain("Reporte SEO");
      expect(result.isFallback).toBe(false);
      expect(result.modelUsed).toBe("gpt-4");
    }
  });

  it("returns fallback report when AI fails", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "Test", domain: "test.com", ownerId: "user-1" }],
      [{ clicks: 100, impressions: 5000, ctr: 0.02, position: 3.5 }],
      [{ activeUsers: 50, conversions: 5, engagementRate: 0.8 }],
      [{ status: "completed" }],
      [{ count: 10 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: false,
      error: "model unavailable",
    });

    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(true);
      expect(result.report).toContain("Strategic Connex");
      expect(result.report).toContain("Test");
    }
  });

  it("returns contingency report when an exception is thrown", async () => {
    vi.mocked(withRLS).mockRejectedValue(new Error("DB connection lost"));
    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isFallback).toBe(true);
      expect(result.report).toContain("Contingencia");
    }
  });

  it("generates fallback with no GSC/GA4 data", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "NewProject", domain: "new.com", ownerId: "user-1" }],
      [],
      [],
      [],
      [{ count: 0 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: false,
      error: "no models",
    });

    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report).toContain("NewProject");
      expect(result.report).toContain("new.com");
    }
  });

  it("generates fallback with partial data (GSC only)", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "GscOnly", domain: "gsc.com", ownerId: "user-1" }],
      [{ clicks: 200, impressions: 10000, ctr: 0.02, position: 5 }],
      [],
      [{ status: "pending" }],
      [{ count: 5 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: false,
      error: "unavailable",
    });

    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report).toContain("GscOnly");
      expect(result.report).toContain("gsc.com");
    }
  });

  it("generates fallback with GA4 only data", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "Ga4Only", domain: "ga4.com", ownerId: "user-1" }],
      [],
      [{ activeUsers: 100, conversions: 10, engagementRate: 0.9 }],
      [],
      [{ count: 3 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: false,
      error: "unavailable",
    });

    const result = await generateSeoReport("proj-1", "user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report).toContain("Ga4Only");
    }
  });

  it("passes correct data structure to AI", async () => {
    setupThenResults([
      [{ id: "proj-1", name: "AI Test", domain: "ai.com", ownerId: "user-1" }],
      [{ clicks: 50, impressions: 2000, ctr: 0.025, position: 2.1 }],
      [{ activeUsers: 30, conversions: 3, engagementRate: 0.75 }],
      [{ status: "completed" }],
      [{ count: 15 }],
    ]);
    vi.mocked(callAIWithFallback).mockResolvedValue({
      success: true,
      content: "Reporte",
    });

    await generateSeoReport("proj-1", "user-1");

    expect(callAIWithFallback).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(callAIWithFallback).mock.calls[0]![0];
    expect(callArgs.taskType).toBe("seo-report");
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0]!.role).toBe("system");
    expect(callArgs.messages[1]!.role).toBe("user");
    expect(callArgs.messages[1]!.content).toContain("AI Test");
    expect(callArgs.messages[1]!.content).toContain("ai.com");
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.maxTokens).toBe(3000);
  });
});
