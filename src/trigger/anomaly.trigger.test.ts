/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Periodic Anomaly Detection — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de proyectos activos (deletedAt IS NULL)
   - Ejecución de runAllDetections por proyecto y agregación de anomalías
   - Tolerancia a errores por proyecto (el ciclo continúa)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AnomalyTaskConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: string }) => Promise<Record<string, unknown>>;
}

interface DetectionResult {
  metricType: string;
  checked: boolean;
  anomalies: number;
  reason?: string;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunAllDetections = vi.fn<
  (projectId: string, opts: { windowHours: number }) => Promise<DetectionResult[]>
>();

vi.mock("@/server/intelligence/anomaly/detector", () => ({
  runAllDetections: mockRunAllDetections,
}));

const mockWhere = vi.fn<() => Promise<unknown[]>>();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/shared/db", () => ({
  db: { select: mockSelect },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", deletedAt: "deletedAt", name: "name", domain: "domain" },
}));

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config: AnomalyTaskConfig) => config),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Periodic Anomaly Detection", () => {
  const payload = { timestamp: "2026-08-02T00:00:00.000Z" };
  const activeProject = { id: "p1", name: "Acme", domain: "acme.com", deletedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { periodicAnomalyDetection } = await import("./anomaly.trigger");
    const task = periodicAnomalyDetection as unknown as AnomalyTaskConfig;
    expect(task.id).toBe("periodic-anomaly-detection");
    expect(task.cron).toBe("*/15 * * * *");
  });

  it("sin proyectos activos → processed 0 y sin ejecutar detecciones", async () => {
    mockWhere.mockResolvedValue([]);

    const { periodicAnomalyDetection } = await import("./anomaly.trigger");
    const task = periodicAnomalyDetection as unknown as AnomalyTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(0);
    expect(result.successCount).toBe(0);
    expect(mockRunAllDetections).not.toHaveBeenCalled();
  });

  it("con anomalías detectadas → total agregado y summaries por proyecto", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunAllDetections.mockResolvedValue([
      { metricType: "latency", checked: true, anomalies: 2 },
      { metricType: "error_rate", checked: true, anomalies: 1 },
    ]);

    const { periodicAnomalyDetection } = await import("./anomaly.trigger");
    const task = periodicAnomalyDetection as unknown as AnomalyTaskConfig;
    const result = await task.run(payload);

    expect(mockRunAllDetections).toHaveBeenCalledWith("p1", { windowHours: 24 });
    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.totalAnomalies).toBe(3);

    const first = (result.summaries as Array<Record<string, unknown>>)[0];
    expect(first.projectId).toBe("p1");
    expect(first.metricCount).toBe(2);
    expect(first.totalAnomalies).toBe(3);
  });

  it("sin anomalías → totalAnomalies 0 con success true", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunAllDetections.mockResolvedValue([
      { metricType: "latency", checked: true, anomalies: 0 },
      { metricType: "error_rate", checked: false, reason: "insufficient data", anomalies: 0 },
    ]);

    const { periodicAnomalyDetection } = await import("./anomaly.trigger");
    const task = periodicAnomalyDetection as unknown as AnomalyTaskConfig;
    const result = await task.run(payload);

    expect(result.totalAnomalies).toBe(0);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it("error en un proyecto → se captura y el ciclo continúa", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunAllDetections.mockRejectedValue(new Error("DB timeout"));

    const { periodicAnomalyDetection } = await import("./anomaly.trigger");
    const task = periodicAnomalyDetection as unknown as AnomalyTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);

    const first = (result.summaries as Array<Record<string, unknown>>)[0];
    expect(first.error).toBe("DB timeout");
    expect(first.totalAnomalies).toBe(0);
  });
});
