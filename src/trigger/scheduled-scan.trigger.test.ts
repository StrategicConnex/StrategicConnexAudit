/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Scheduled Scan — Tests del task programado (P0)

   Documenta el estado actual del trigger:
   - scheduled-scan.trigger.ts es un CONFIG de tarea (stub) que exporta
     scheduledScanTaskConfig — NO registra task en Trigger.dev vía schedules.task
     (hallazgo documentado en el Job Contract JOB-CONTRACT-scheduled-scan).
   - Verifica la forma del config (id/name/cron) y el comportamiento del run stub.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ScheduledScanConfig {
  id: string;
  name: string;
  cron: string;
  run: () => Promise<Record<string, unknown>>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Scheduled Scan", () => {
  it("expone el config con id, name y cron correctos", async () => {
    const { scheduledScanTaskConfig } = await import("./scheduled-scan.trigger");
    const config = scheduledScanTaskConfig as ScheduledScanConfig;
    expect(config.id).toBe("scheduled-scan-runner");
    expect(config.name).toBe("Scheduled Intelligence Scanning Cron");
    expect(config.cron).toBe("0 * * * *");
  });

  it("run stub devuelve success con processedProjects 0", async () => {
    const { scheduledScanTaskConfig } = await import("./scheduled-scan.trigger");
    const config = scheduledScanTaskConfig as ScheduledScanConfig;
    const result = await config.run();
    expect(result.success).toBe(true);
    expect(result.processedProjects).toBe(0);
    expect(result.timestamp).toBeDefined();
  });

  it("el config NO es un task registrado (stub documentado en JOB-CONTRACT)", async () => {
    const { scheduledScanTaskConfig } = await import("./scheduled-scan.trigger");
    const config = scheduledScanTaskConfig as ScheduledScanConfig;
    // Un task registrado tendría métodos de Trigger.dev (trigger(), id con prefijo);
    // este es un objeto plano sin registrar. [VERIFIED — job contract T05-01]
    expect(config).not.toHaveProperty("trigger");
    expect(config).not.toHaveProperty("enqueue");
  });
});
