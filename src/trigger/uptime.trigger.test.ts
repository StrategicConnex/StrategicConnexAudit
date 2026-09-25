/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Uptime Monitor — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de proyectos activos
   - HEAD request con egress-guard (normalizeUrl + validateSafeUrl)
   - Persistencia de uptimeLogs: isUp true/false + statusCode + errorMessage
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

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
const mockInsertValues = vi.fn<(values: UptimeLogValues[]) => Promise<void>>();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockDbExecute = vi.fn(async (_query?: unknown) => ({
  rows: [] as Array<{ project_id: string; is_up: boolean }>,
}));
const mockEmit = vi.fn(async (..._args: unknown[]) => {});
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const mockSafeFetchFollow = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/shared/db", () => ({
  db: { select: mockSelect, insert: mockInsert, execute: mockDbExecute },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", deletedAt: "deletedAt", name: "name", domain: "domain" },
  uptimeLogs: { projectId: "projectId", isUp: "isUp" },
}));

vi.mock("@/server/lib/project-events", () => ({
  emitProjectEvent: (...args: unknown[]) => mockEmit(...args),
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  validateSafeUrl: vi.fn(async (url: string) => url),
  normalizeUrl: vi.fn((url: string) => `https://${url}`),
  safeFetchFollow: (...args: [string, (RequestInit | undefined)?]) => mockSafeFetchFollow(...args),
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
    mockSafeFetchFollow.mockResolvedValue(new Response(null, { status: 200 }));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockSafeFetchFollow).toHaveBeenCalledTimes(1);
    // HEAD + egress-guard (normalizeUrl aplicado + redirects revalidados)
    const [url, init] = mockSafeFetchFollow.mock.calls[0]!;
    expect(url).toBe("https://acme.com");
    expect(init?.method).toBe("HEAD");

    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values).toHaveLength(1);
    expect(values[0]!.projectId).toBe("p1");
    expect(values[0]!.isUp).toBe(true);
    expect(values[0]!.statusCode).toBe(200);
    expect(values[0]!.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(values[0]!.errorMessage).toBeNull();
    // UP → sin consulta de estado previo ni eventos
    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("proyecto DOWN (fetch lanza error) → log con isUp false y errorMessage", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockSafeFetchFollow.mockRejectedValue(new Error("ECONNREFUSED"));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values[0]!.isUp).toBe(false);
    expect(values[0]!.errorMessage).toContain("ECONNREFUSED");
  });

  it("proyecto con respuesta HTTP 500 → isUp false, statusCode 500, sin errorMessage", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockSafeFetchFollow.mockResolvedValue(new Response(null, { status: 500 }));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0];
    expect(values[0]!.isUp).toBe(false);
    expect(values[0]!.statusCode).toBe(500);
    expect(values[0]!.errorMessage).toBeNull();
  });

  it("transición up→down: consulta estado previo en 1 query y emite uptime.down", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockSafeFetchFollow.mockRejectedValue(new Error("ECONNREFUSED"));
    mockDbExecute.mockResolvedValueOnce({ rows: [{ project_id: "p1", is_up: true }] });

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    await task.run(payload);

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "p1",
      "uptime.down",
      expect.objectContaining({ domain: "acme.com", errorMessage: "ECONNREFUSED" })
    );
  });

  it("ciclo caído persistente (previo is_up=false) → NO emite evento", async () => {
    mockWhere.mockResolvedValue([{ id: "p1", name: "Acme", domain: "acme.com", deletedAt: null }]);
    mockSafeFetchFollow.mockRejectedValue(new Error("ECONNREFUSED"));
    mockDbExecute.mockResolvedValueOnce({ rows: [{ project_id: "p1", is_up: false }] });

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    await task.run(payload);

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("varios proyectos caídos → 1 insert batch + 1 query de estado previo (sin N+1)", async () => {
    mockWhere.mockResolvedValue([
      { id: "p1", name: "Acme", domain: "acme.com", deletedAt: null },
      { id: "p2", name: "Beta", domain: "beta.com", deletedAt: null },
      { id: "p3", name: "Gamma", domain: "gamma.com", deletedAt: null },
    ]);
    mockSafeFetchFollow.mockRejectedValue(new Error("timeout"));

    const { uptimeMonitor } = await import("./uptime.trigger");
    const task = uptimeMonitor as unknown as UptimeTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(3);
    // 1 solo insert con las 3 filas (antes: 1 insert + 1 select por proyecto)
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues.mock.calls[0]![0]).toHaveLength(3);
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    // Regresión: el array interpolado aporta sus propios paréntesis → el SQL
    // final debe ser `IN ($1, $2, $3)` y NUNCA `IN (($1, $2, $3))` (inválido).
    const built = new PgDialect().sqlToQuery(mockDbExecute.mock.calls[0]![0] as never);
    expect(built.sql).toContain("project_id IN ($1, $2, $3)");
    expect(built.sql).not.toContain("IN ((");
    expect(built.params).toHaveLength(3);
  });
});
