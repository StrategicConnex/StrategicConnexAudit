import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getExecutor: vi.fn(),
  getToolDefinition: vi.fn(),
  enforceToolRunPolicy: vi.fn(),
  initializePluginExecutors: vi.fn(),
  executionCache: { get: vi.fn(), set: vi.fn() },
  IntelligenceCache: { buildKey: vi.fn(() => "cache:key") },
  httpSemaphore: { run: vi.fn(async (fn: () => Promise<unknown>) => fn()) },
  dnsSemaphore: { run: vi.fn(async (fn: () => Promise<unknown>) => fn()) },
}));

vi.mock("./tool-registry", () => ({
  getExecutor: mocks.getExecutor,
  getToolDefinition: mocks.getToolDefinition,
}));

vi.mock("./policy-enforcer", () => ({
  enforceToolRunPolicy: mocks.enforceToolRunPolicy,
}));

vi.mock("../plugins/plugin-executor", () => ({
  initializePluginExecutors: mocks.initializePluginExecutors,
}));

vi.mock("./cache", () => ({
  executionCache: mocks.executionCache,
  IntelligenceCache: mocks.IntelligenceCache,
}));

vi.mock("./concurrency", () => ({
  httpSemaphore: mocks.httpSemaphore,
  dnsSemaphore: mocks.dnsSemaphore,
}));

import { executeTool } from "./dispatcher";

describe("executeTool — dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceToolRunPolicy.mockResolvedValue({ allowed: true });
  });

  it("returns error for unknown tool", async () => {
    mocks.getExecutor.mockReturnValue(undefined);
    mocks.getToolDefinition.mockReturnValue(undefined);
    const result = await executeTool("nonexistent.tool", "example.com", {}, "proj-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("no tiene un ejecutor técnico configurado");
  });

  it("returns error when policy blocks execution", async () => {
    mocks.getExecutor.mockReturnValue({ id: "test", validate: vi.fn(), execute: vi.fn() });
    mocks.getToolDefinition.mockReturnValue({ id: "test", timeoutMs: 5000 });
    mocks.enforceToolRunPolicy.mockResolvedValue({ allowed: false, reason: "Plan limit reached" });
    const result = await executeTool("test", "example.com", {}, "proj-1");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Plan limit reached");
  });

  it("returns error on input validation failure", async () => {
    const validateFn = vi.fn(() => { throw new Error("Invalid domain"); });
    mocks.getExecutor.mockReturnValue({ id: "test", validate: validateFn, execute: vi.fn() });
    mocks.getToolDefinition.mockReturnValue({ id: "test", timeoutMs: 5000 });
    const result = await executeTool("test", "example.com", {}, "proj-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Validación de entrada fallida");
  });

  it("returns cached result when available", async () => {
    const cachedResult = { success: true, output: { data: "cached" }, findings: [] };
    mocks.executionCache.get.mockReturnValue(cachedResult);
    mocks.getExecutor.mockReturnValue({ id: "test", validate: vi.fn((i) => i), execute: vi.fn() });
    mocks.getToolDefinition.mockReturnValue({ id: "test", timeoutMs: 5000 });
    const result = await executeTool("test", "example.com", {}, "proj-1");
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>)._fromCache).toBe(true);
    expect(mocks.executionCache.set).not.toHaveBeenCalled();
  });

  it("executes and caches successful result", async () => {
    const execResult = { success: true, output: { ip: "1.2.3.4" }, findings: [] };
    const executeFn = vi.fn().mockResolvedValue(execResult);
    mocks.executionCache.get.mockReturnValue(null);
    mocks.getExecutor.mockReturnValue({
      id: "test",
      validate: (i: Record<string, unknown>) => i,
      execute: executeFn,
      timeoutMs: 5000,
    });
    mocks.getToolDefinition.mockReturnValue({ id: "test", timeoutMs: 5000 });
    const result = await executeTool("test", "example.com", {}, "proj-1");
    expect(result.success).toBe(true);
    expect(mocks.executionCache.set).toHaveBeenCalled();
  });

  it("returns error on execution failure", async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error("Network error"));
    mocks.executionCache.get.mockReturnValue(null);
    mocks.getExecutor.mockReturnValue({
      id: "test",
      validate: (i: Record<string, unknown>) => i,
      execute: executeFn,
      timeoutMs: 5000,
    });
    mocks.getToolDefinition.mockReturnValue({ id: "test", timeoutMs: 5000 });
    const result = await executeTool("test", "example.com", {}, "proj-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("initializes plugin executors for plugin.* tools", async () => {
    mocks.getExecutor.mockReturnValue(undefined);
    mocks.getToolDefinition.mockReturnValue(undefined);
    await executeTool("plugin.custom", "example.com", {}, "proj-1");
    expect(mocks.initializePluginExecutors).toHaveBeenCalled();
  });

  it("uses dnsSemaphore for dns.* tools", async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true, output: {}, findings: [] });
    mocks.executionCache.get.mockReturnValue(null);
    mocks.getExecutor.mockReturnValue({
      id: "dns.lookup",
      validate: (i: Record<string, unknown>) => i,
      execute: executeFn,
      timeoutMs: 5000,
    });
    mocks.getToolDefinition.mockReturnValue({ id: "dns.lookup", timeoutMs: 5000 });
    await executeTool("dns.lookup", "example.com", {}, "proj-1");
    expect(mocks.dnsSemaphore.run).toHaveBeenCalled();
    expect(mocks.httpSemaphore.run).not.toHaveBeenCalled();
  });
});
