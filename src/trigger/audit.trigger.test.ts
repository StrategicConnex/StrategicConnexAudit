/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Audit Runner — Tests del task on-demand (P0)

   Verifica:
   - Registro del task (id + retry)
   - Flujo completo: marca running → verifica ownership → crawl → guarda
     crawlResults/issues → marca completed
   - Generación de issues SEO cuando falta <title>
   - Rechazo por ownership (userId != ownerId) y auditoría no encontrada
   - Manejo de error: marca failed y re-lanza
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AuditTaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { projectId: string; auditId: string; userId?: string }) => Promise<unknown>;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockReturning = vi.fn<() => Promise<unknown[]>>();
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockSet = vi.fn<(values: Record<string, unknown>) => { where: typeof mockWhere }>(
  () => ({ where: mockWhere })
);
const mockUpdate = vi.fn(() => ({ set: mockSet }));
const mockLimit = vi.fn<() => Promise<unknown[]>>();
const mockSelectWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockInsertValues = vi.fn<
  (values: Record<string, unknown> | Array<Record<string, unknown>>) => Promise<void>
>();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

vi.mock("@/shared/db", () => ({
  directDb: { update: mockUpdate, select: mockSelect, insert: mockInsert },
}));

vi.mock("@/shared/db/schemas", () => ({
  audits: { id: "id", status: "status" },
  projects: { id: "id", ownerId: "ownerId", domain: "domain", name: "name" },
  crawlResults: { auditId: "auditId" },
  issues: { projectId: "projectId", auditId: "auditId" },
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  validateSafeUrl: vi.fn(async (url: string) => url),
  normalizeUrl: vi.fn((url: string) => url),
}));

class MockBreaker {
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

vi.mock("@/shared/lib/circuit-breaker", () => ({
  RedisCircuitBreaker: MockBreaker,
}));

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: AuditTaskConfig) => config),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Audit Runner", () => {
  const auditRecord = { id: "a1", status: "running" };
  const projectRecord = { id: "p1", ownerId: "u1", domain: "https://acme.com", name: "Acme" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registra el task con id y retry correctos", async () => {
    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    expect(task.id).toBe("run-project-audit");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("flujo completo exitoso → marca running/completed y guarda crawlResults", async () => {
    mockReturning.mockResolvedValue([auditRecord]);
    mockLimit.mockResolvedValue([projectRecord]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "<html><head><title>Acme Corp</title><meta name=\"description\" content=\"desc\"></head><body><h1>Welcome</h1><p>" +
            "word ".repeat(300) +
            "</p></body></html>",
          { status: 200, headers: { "content-type": "text/html" } }
        )
      )
    );

    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    await task.run({ projectId: "p1", auditId: "a1", userId: "u1" });

    // update: running + completed
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // insert solo para crawlResults (sin issues: title/meta/h1 presentes)
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const values = mockInsertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(values.auditId).toBe("a1");
    expect(values.statusCode).toBe(200);
    expect(values.title).toBe("Acme Corp");
    expect(values.wordCount).toBeGreaterThanOrEqual(250);
  });

  it("falta <title> → genera issues SEO y los persiste", async () => {
    mockReturning.mockResolvedValue([auditRecord]);
    mockLimit.mockResolvedValue([projectRecord]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html><head></head><body><p>Hola</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      )
    );

    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    await task.run({ projectId: "p1", auditId: "a1", userId: "u1" });

    // insert: crawlResults + issues
    expect(mockInsert).toHaveBeenCalledTimes(2);
    const issues = mockInsertValues.mock.calls[1]![0] as Array<{ title: string }>;
    expect(issues.length).toBeGreaterThanOrEqual(2);
    const titles = issues.map((i) => i.title);
    expect(titles.join(" ")).toContain("Título");
  });

  it("ownership mismatch (userId != ownerId) → lanza Acceso denegado", async () => {
    mockReturning.mockResolvedValue([auditRecord]);
    mockLimit.mockResolvedValue([{ ...projectRecord, ownerId: "other-user" }]);

    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    await expect(task.run({ projectId: "p1", auditId: "a1", userId: "u1" })).rejects.toThrow(
      /Acceso denegado/
    );

    // el catch marca la auditoría como failed
    expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const failedSet = mockSet.mock.calls[1]![0] as Record<string, unknown>;
    expect(failedSet.status).toBe("failed");
  });

  it("auditoría no encontrada → lanza y marca failed", async () => {
    mockReturning.mockResolvedValue([]);

    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    await expect(task.run({ projectId: "p1", auditId: "nope", userId: "u1" })).rejects.toThrow(
      /no encontrado/
    );

    // 2 updates: 1º running (no encuentra el audit y lanza), 2º failed (catch)
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const failedSet = mockSet.mock.calls[1]![0] as Record<string, unknown>;
    expect(failedSet.status).toBe("failed");
  });

  it("error de red → lanza, marca failed y re-lanza", async () => {
    mockReturning.mockResolvedValue([auditRecord]);
    mockLimit.mockResolvedValue([projectRecord]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );

    const { runProjectAudit } = await import("./audit.trigger");
    const task = runProjectAudit as unknown as AuditTaskConfig;
    await expect(task.run({ projectId: "p1", auditId: "a1", userId: "u1" })).rejects.toThrow(
      /ECONNRESET/
    );

    // catch: marca failed → segundo update
    expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const failedSet = mockSet.mock.calls[1]![0] as Record<string, unknown>;
    expect(failedSet.status).toBe("failed");
  });
});
