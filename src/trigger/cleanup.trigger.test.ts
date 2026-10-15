import { describe, it, expect, vi, beforeEach } from "vitest";
import { DISPATCH_OWNER } from "./cron-plan";

interface ScheduleConfig {
  id: string;
  cron?: string;
  run: () => Promise<{
    success: boolean;
    uptimeDeleted: number;
    vitalsDeleted: number;
    heatmapDeleted: number;
    secAuditDeleted: number;
    appLogsDeleted: number;
    intelligenceRunEventsDeleted: number;
    intelligenceToolRunsDeleted: number;
    intelligenceUsageEventsDeleted: number;
  }>;
}

const delWhere = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());

// Las 8 tablas que la task purga, en el orden en que las borra. Se declaran
// hoisted para poder comparar las que recibe `db.delete`. Cada una lleva el
// nombre de su tabla real porque las 5 tablas con sólo `createdAt` son
// indistinguibles entre sí: sin la marca, cambiar el destino de una retención
// por otra pasaría el `toEqual` de abajo sin que nadie se enterara.
const tables = vi.hoisted(() => ({
  uptimeLogs: { table: "uptime_logs", checkedAt: "checkedAt" },
  webVitalsLogs: { table: "web_vitals_logs", recordedAt: "recordedAt" },
  heatmapSessions: { table: "heatmap_sessions", recordedAt: "recordedAt" },
  securityAuditLogs: { table: "security_audit_logs", createdAt: "createdAt" },
  // P2-14: retención de app_logs + tablas de inteligencia (30 días).
  appLogs: { table: "app_logs", createdAt: "createdAt" },
  intelligenceRunEvents: { table: "intelligence_run_events", createdAt: "createdAt" },
  intelligenceToolRuns: { table: "intelligence_tool_runs", createdAt: "createdAt" },
  intelligenceUsageEvents: { table: "intelligence_usage_events", createdAt: "createdAt" },
}));

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: unknown) => config),
}));

vi.mock("@/shared/db", () => ({ db: { delete: del } }));

vi.mock("@/shared/db/schemas", () => tables);

vi.mock("drizzle-orm", () => ({ lt: vi.fn(() => ({})) }));

import { cleanupOldLogs } from "./cleanup.trigger";

describe("Trigger: cleanup-old-logs", () => {
  const task = cleanupOldLogs as unknown as ScheduleConfig;

  beforeEach(() => {
    del.mockReset();
    delWhere.mockReset();
    del.mockImplementation(() => ({ where: delWhere }));
    delWhere.mockResolvedValue({ rowCount: 7 });
  });

  it("registra id sin cron propio: lo dispara daily-operations-dispatcher", () => {
    expect(task.id).toBe("cleanup-old-logs");
    expect(task.cron).toBeUndefined();
    expect(DISPATCH_OWNER["cleanup-old-logs"]).toBe("daily-operations-dispatcher");
  });

  it("purga las 8 tablas de retención y devuelve los rowCount", async () => {
    const result = await task.run();

    expect(del).toHaveBeenCalledTimes(8);
    expect(delWhere).toHaveBeenCalledTimes(8);
    expect(del.mock.calls.map((c) => c[0])).toEqual([
      tables.uptimeLogs,
      tables.webVitalsLogs,
      tables.heatmapSessions,
      tables.securityAuditLogs,
      tables.appLogs,
      tables.intelligenceRunEvents,
      tables.intelligenceToolRuns,
      tables.intelligenceUsageEvents,
    ]);
    expect(result.success).toBe(true);
    expect(result.uptimeDeleted).toBe(7);
    expect(result.vitalsDeleted).toBe(7);
    expect(result.heatmapDeleted).toBe(7);
    expect(result.secAuditDeleted).toBe(7);
    expect(result.appLogsDeleted).toBe(7);
    expect(result.intelligenceRunEventsDeleted).toBe(7);
    expect(result.intelligenceToolRunsDeleted).toBe(7);
    expect(result.intelligenceUsageEventsDeleted).toBe(7);
  });

  it("si una purga falla → propaga el error (también en las 4 tablas P2-14)", async () => {
    delWhere.mockRejectedValue(new Error("purge boom"));
    await expect(task.run()).rejects.toThrow("purge boom");

    // El fallo de una retención antigua corta la cadena: no se llega a las nuevas.
    delWhere.mockReset();
    let llamada = 0;
    delWhere.mockImplementation(() => {
      llamada += 1;
      if (llamada === 6) return Promise.reject(new Error("retención boom"));
      return Promise.resolve({ rowCount: 7 });
    });
    await expect(task.run()).rejects.toThrow("retención boom");
  });
});
