/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: SIEM Exporter — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - run delega a runSiemExport y mapea el resultado
   - Manejo de patrones detectados, alertas y errores parciales
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface SiemTaskConfig {
  id: string;
  cron: string;
  run: () => Promise<Record<string, unknown>>;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunSiemExport = vi.fn<() => Promise<Record<string, unknown>>>();

vi.mock("@/server/security/siem-exporter", () => ({
  runSiemExport: mockRunSiemExport,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  schedules: {
    task: vi.fn((config: SiemTaskConfig) => config),
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Trigger: SIEM Exporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { siemExporterTask } = await import("./siem.trigger");
    const task = siemExporterTask as unknown as SiemTaskConfig;
    expect(task.id).toBe("siem-exporter");
    expect(task.cron).toBe("*/5 * * * *");
  });

  it("run sin patrones ni alertas → success true", async () => {
    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [],
      heartbeat: { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: 5 },
      alertsSent: 0,
      alertsFailed: 0,
      errors: [],
    });

    const { siemExporterTask } = await import("./siem.trigger");
    const task = siemExporterTask as unknown as SiemTaskConfig;
    const result = await task.run();

    expect(result.success).toBe(true);
    expect(result.patternsDetected).toBe(0);
    expect(result.alertsSent).toBe(0);
    expect(result.timestamp).toBeDefined();
  });

  it("run con patrones detectados → counts reflejados", async () => {
    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [
        { eventType: "open_redirect_attempt", ip: "10.0.0.5", count: 3, severity: "critical" },
        { eventType: "csp_violation", ip: "10.0.0.9", count: 1, severity: "medium" },
      ],
      heartbeat: { sent: true, reason: "due", lastHeartbeatAgoMinutes: null },
      alertsSent: 2,
      alertsFailed: 0,
      errors: [],
    });

    const { siemExporterTask } = await import("./siem.trigger");
    const task = siemExporterTask as unknown as SiemTaskConfig;
    const result = await task.run();

    expect(result.success).toBe(true);
    expect(result.patternsDetected).toBe(2);
    expect(result.alertsSent).toBe(2);
    expect(result.alertsFailed).toBe(0);
  });

  it("run con errores parciales → success false y errores expuestos", async () => {
    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [{ eventType: "auth_failure_burst", ip: "10.0.0.7", count: 12, severity: "high" }],
      heartbeat: { sent: true, reason: "due", lastHeartbeatAgoMinutes: null },
      alertsSent: 1,
      alertsFailed: 2,
      errors: ["Slack webhook timeout", "PagerDuty 503"],
    });

    const { siemExporterTask } = await import("./siem.trigger");
    const task = siemExporterTask as unknown as SiemTaskConfig;
    const result = await task.run();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.patternsDetected).toBe(1);
  });
});
