/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Monitor Evaluation — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de monitores activos (enabled)
   - Resolución del dominio del proyecto (hostname)
   - Ejecución de executeTool y generación de alerta ante hallazgos High/Critical
   - Actualización de lastRunAt + tolerancia a errores por monitor
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface MonitorTaskConfig {
  id: string;
  cron: string;
  run: (payload: unknown, ctx: unknown) => Promise<Record<string, unknown>>;
}

interface ToolResult {
  success: boolean;
  findings?: Array<{ severity: string }>;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockExecuteTool = vi.fn<
  (toolId: string, target: string, opts: object, projectId: string, userId?: string, ownerId?: string) => Promise<ToolResult>
>();

vi.mock("@/server/intelligence/core/dispatcher", () => ({
  executeTool: mockExecuteTool,
}));

const mockFindMany = vi.fn<() => Promise<unknown[]>>();
const mockFindFirst = vi.fn<() => Promise<unknown>>();
const mockInsertValues = vi.fn<
  (values: Record<string, unknown>) => Promise<unknown>
>();
const mockUpdateSetWhere = vi.fn<() => Promise<unknown>>();

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      monitoringSchedules: { findMany: mockFindMany },
      projects: { findFirst: mockFindFirst },
    },
    insert: vi.fn(() => ({ values: mockInsertValues })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateSetWhere })) })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  monitoringSchedules: { id: "id", enabled: "enabled", projectId: "projectId" },
  monitoringAlerts: { projectId: "projectId", scheduleId: "scheduleId" },
  projects: { id: "id", domain: "domain", ownerId: "ownerId" },
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  schedules: {
    task: vi.fn((config: MonitorTaskConfig) => config),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Monitor Evaluation", () => {
  const payload = {};
  const ctx = {};
  const monitor = { id: "m1", projectId: "p1", enabled: true };
  const project = { id: "p1", domain: "https://acme.com", ownerId: "u1" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    expect(task.id).toBe("evaluate-monitors-task");
    expect(task.cron).toBe("0 0 * * *");
  });

  it("sin monitores activos → evaluated 0 y sin ejecutar tools", async () => {
    mockFindMany.mockResolvedValue([]);

    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.evaluated).toBe(0);
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("con hallazgos High/Critical → genera alerta y actualiza lastRunAt", async () => {
    mockFindMany.mockResolvedValue([monitor]);
    mockFindFirst.mockResolvedValue(project);
    mockExecuteTool.mockResolvedValue({
      success: true,
      findings: [
        { severity: "low" },
        { severity: "critical" },
        { severity: "high" },
      ],
    });

    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    const result = await task.run(payload, ctx);

    // hostname resuelto desde https://acme.com → acme.com
    expect(mockExecuteTool).toHaveBeenCalledWith(
      "tls.scan",
      "acme.com",
      { host: "acme.com" },
      "p1",
      undefined,
      "u1"
    );

    expect(result.evaluated).toBe(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const alertValues = mockInsertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(alertValues.projectId).toBe("p1");
    expect(alertValues.scheduleId).toBe("m1");
    expect(alertValues.severity).toBe("critical");
    expect(alertValues.resolved).toBe(false);
    expect(mockUpdateSetWhere).toHaveBeenCalledTimes(1);
  });

  it("sin hallazgos High/Critical → NO genera alerta pero actualiza lastRunAt", async () => {
    mockFindMany.mockResolvedValue([monitor]);
    mockFindFirst.mockResolvedValue(project);
    mockExecuteTool.mockResolvedValue({
      success: true,
      findings: [{ severity: "low" }, { severity: "medium" }],
    });

    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.evaluated).toBe(1);
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateSetWhere).toHaveBeenCalledTimes(1);
  });

  it("proyecto sin dominio → se omite el monitor (continue)", async () => {
    mockFindMany.mockResolvedValue([monitor]);
    mockFindFirst.mockResolvedValue({ id: "p1", domain: null, ownerId: "u1" });

    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.evaluated).toBe(1);
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("error en executeTool → se captura y el ciclo continúa", async () => {
    mockFindMany.mockResolvedValue([monitor]);
    mockFindFirst.mockResolvedValue(project);
    mockExecuteTool.mockRejectedValue(new Error("tool timeout"));

    const { evaluateMonitorsTask } = await import("./monitoring.trigger");
    const task = evaluateMonitorsTask as unknown as MonitorTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.evaluated).toBe(1);
    // el error cae en el catch → ni alerta ni update de lastRunAt
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateSetWhere).not.toHaveBeenCalled();
  });
});
