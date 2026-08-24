/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Uptime Monitor — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de proyectos activos
   - HEAD request con egress-guard (normalizeUrl + validateSafeUrl)
   - Persistencia de uptimeLogs: isUp true/false + statusCode + errorMessage
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface UptimeTaskConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: string }) => Promise<Record<string, unknown>>;
}

interface UptimeLogValues {
  projectId: string;
  isUp: boolean;
  statusCode: number;
  responseTimeMs: number;
  errorMessage: string | null;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockWhere = vi.fn<() => Promise<unknown[]>>();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockInsertValues = vi.fn<(values: UptimeLogValues) => Promise<void>>();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/shared/db", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", deletedAt: "deletedAt", name: "name", domain: "domain" },
  uptimeLogs: { projectId: "projectId", isUp: "isUp" },
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  validateSafeUrl: vi.fn(async (url: string) => url),
  normalizeUrl: vi.fn((url: string) => `https://${url}`),
}));

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config: UptimeTaskConfig) => config),
  },
  wait: { for: vi.fn(async () => {}) },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Trigger: Uptime Monitor", () => {
  const payload = { timestamp: "2026-08-02T00:00:00.000Z" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registra el task con id y cron correctos", async () => {
    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    expect(task.id).toBe("uptime-monitor");
    expect(task.cron).toBe("*/15 * * * *");
  });

  it("sin proyectos activos → processed 0 y sin insert", async () => {
    mockWhere.mockResolvedValue([]);

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("proyecto UP (HTTP 200) → log con isUp true y statusCode", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // HEAD + egress-guard (normalizeUrl aplicado)
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://acme.com");
    expect(init?.method).toBe("HEAD");

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values.projectId).toBe("p1");
    expect(values.isUp).toBe(true);
    expect(values.statusCode).toBe(200);
    expect(values.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(values.errorMessage).toBeNull();
  });

  it("proyecto DOWN (fetch lanza error) → log con isUp false y errorMessage", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values.isUp).toBe(false);
    expect(values.errorMessage).toContain("ECONNREFUSED");
  });

  it("proyecto con respuesta HTTP 500 → isUp false, statusCode 500, sin errorMessage", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values.isUp).toBe(false);
    expect(values.statusCode).toBe(500);
    expect(values.errorMessage).toBeNull();
  });
});
