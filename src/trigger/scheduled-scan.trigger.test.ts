/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Scheduled Scan — Tests del task programado (P1, producción)

   Verifica la implementación REAL (reemplaza el stub):
   - Registro del task (id + cron correctos)
   - Solo procesa schedules habilitados y vencidos (nextRunAt <= now)
   - Crea audit pending y encola run-project-audit por schedule
   - Reserva nextRunAt ANTES de encolar (idempotencia)
   - Error por schedule no tumba el ciclo
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ScheduledScanResult {
  success: boolean;
  processedSchedules: number;
  enqueuedAudits: Array<{ scheduleId: string; projectId: string; auditId: string }>;
  errors: Array<{ scheduleId: string; error: string }>;
  timestamp: string;
}

interface ScheduledScanConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: string }) => Promise<ScheduledScanResult>;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockWhere = vi.fn<() => Promise<unknown[]>>();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockInsertReturning = vi.fn<() => Promise<unknown[]>>();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockTasksTrigger = vi.fn();

vi.mock("@/shared/db", () => ({
  directDb: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  monitoringSchedules: { id: "id", projectId: "projectId", enabled: "enabled", interval: "interval", nextRunAt: "nextRunAt", lastRunAt: "lastRunAt", updatedAt: "updatedAt" },
  audits: { id: "id", projectId: "projectId", type: "type", status: "status", startedAt: "startedAt" },
}));

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config: ScheduledScanConfig) => config),
  },
  tasks: {
    trigger: (...args: unknown[]) => mockTasksTrigger(...args),
  },
}));

vi.mock("./audit.trigger", () => ({
  runProjectAudit: { id: "run-project-audit" },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Scheduled Scan (real)", () => {
  const payload = { timestamp: "2026-08-08T10:00:00.000Z" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { scheduledScanTask } = await import("./scheduled-scan.trigger");
    const task = scheduledScanTask as unknown as ScheduledScanConfig;
    expect(task.id).toBe("scheduled-scan-runner");
    expect(task.cron).toBe("0 * * * *");
  });

  it("sin schedules vencidos → processed 0 y sin encolar", async () => {
    mockWhere.mockResolvedValue([]);

    const { scheduledScanTask } = await import("./scheduled-scan.trigger");
    const task = scheduledScanTask as unknown as ScheduledScanConfig;
    const result = await task.run(payload);

    expect(result.processedSchedules).toBe(0);
    expect(mockTasksTrigger).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("schedule vencido → crea audit, encola job y reserva próximo run", async () => {
    const due = [{
      id: "sch-1",
      projectId: "proj-1",
      enabled: true,
      interval: "daily",
      nextRunAt: new Date("2026-08-08T09:00:00.000Z"),
    }];
    mockWhere.mockResolvedValue(due);
    mockInsertReturning.mockResolvedValue([{ id: "audit-1" }]);

    const { scheduledScanTask } = await import("./scheduled-scan.trigger");
    const task = scheduledScanTask as unknown as ScheduledScanConfig;
    const result = await task.run(payload);

    // 1. Reserva nextRunAt antes del audit (idempotencia)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const updateCall = mockUpdateSet.mock.calls[0] as unknown as [{ lastRunAt: Date; nextRunAt: Date }];
    const updateSet = updateCall[0];
    expect(updateSet.lastRunAt).toBeInstanceOf(Date);
    expect(updateSet.nextRunAt.getTime()).toBeGreaterThan(Date.parse("2026-08-08T10:00:00.000Z"));

    // 2. Audit creado con type full y status pending
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "proj-1",
      type: "full",
      status: "pending",
    }));

    // 3. Job encolado con projectId + auditId
    expect(mockTasksTrigger).toHaveBeenCalledWith("run-project-audit", {
      projectId: "proj-1",
      auditId: "audit-1",
    });

    expect(result.processedSchedules).toBe(1);
    expect(result.enqueuedAudits).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("error de encolado → no tumba el ciclo y queda registrado en errors", async () => {
    const due = [
      { id: "sch-ok", projectId: "proj-ok", enabled: true, interval: "weekly", nextRunAt: new Date("2026-08-08T09:00:00.000Z") },
      { id: "sch-bad", projectId: "proj-bad", enabled: true, interval: "weekly", nextRunAt: new Date("2026-08-08T09:00:00.000Z") },
    ];
    mockWhere.mockResolvedValue(due);
    mockInsertReturning
      .mockResolvedValueOnce([{ id: "audit-ok" }])
      .mockResolvedValueOnce([{ id: "audit-bad" }]);
    mockTasksTrigger
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Trigger.dev down"));

    const { scheduledScanTask } = await import("./scheduled-scan.trigger");
    const task = scheduledScanTask as unknown as ScheduledScanConfig;
    const result = await task.run(payload);

    expect(result.processedSchedules).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].scheduleId).toBe("sch-bad");
    // El schedule bueno sí se encoló
    expect(mockTasksTrigger).toHaveBeenCalledTimes(2);
  });

  it("interval desconocido → cae a weekly por defecto", async () => {
    const due = [{
      id: "sch-x",
      projectId: "proj-x",
      enabled: true,
      interval: "hourly", // no soportado
      nextRunAt: new Date("2026-08-08T09:00:00.000Z"),
    }];
    mockWhere.mockResolvedValue(due);
    mockInsertReturning.mockResolvedValue([{ id: "audit-x" }]);

    const { scheduledScanTask } = await import("./scheduled-scan.trigger");
    const task = scheduledScanTask as unknown as ScheduledScanConfig;
    await task.run(payload);

    const firstCall = mockUpdateSet.mock.calls[0] as unknown as [{ nextRunAt: Date }];
    const nextRunAt = firstCall[0].nextRunAt;
    // weekly = 7 días
    expect(nextRunAt.getTime() - Date.parse("2026-08-08T10:00:00.000Z")).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
