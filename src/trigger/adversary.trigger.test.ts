/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Periodic Adversary Simulation — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de proyectos activos (deletedAt IS NULL)
   - Omisión de escenarios manuales (executorType === "manual")
   - Ejecución de runScenario por escenario con mapeo detected/missed/error
   - Tolerancia a errores por proyecto (el ciclo continúa)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AdversaryTaskConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: string }) => Promise<Record<string, unknown>>;
}

interface ScenarioRunResult {
  success: boolean;
  result?: "detected" | "missed";
  scoreImpact?: number;
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunScenario = vi.fn<
  (args: { scenarioMitreId: string; projectId: string }) => Promise<ScenarioRunResult>
>();

vi.mock("@/server/intelligence/adversary/scenario-runner", () => ({
  runScenario: mockRunScenario,
}));

// Catálogo mock: T1078.001 es manual (se omite); el resto es ejecutable.
// Los 5 SCHEDULED_SCENARIOS del trigger: T1078.001, T1046, T1021.001, T1530, T1490.
vi.mock("@/server/intelligence/adversary/catalog", () => ({
  ADVERSARY_CATALOG: [
    { mitreId: "T1078.001", executorType: "manual" },
    { mitreId: "T1046", executorType: "bash" },
    { mitreId: "T1021.001", executorType: "bash" },
    { mitreId: "T1530", executorType: "http" },
    { mitreId: "T1490", executorType: "http" },
  ],
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
    task: vi.fn((config: AdversaryTaskConfig) => config),
  },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Periodic Adversary Simulation", () => {
  const payload = { timestamp: "2026-08-02T00:00:00.000Z" };
  const activeProject = { id: "p1", name: "Acme", domain: "acme.com", deletedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { periodicAdversarySimulation } = await import("./adversary.trigger");
    const task = periodicAdversarySimulation as unknown as AdversaryTaskConfig;
    expect(task.id).toBe("periodic-adversary-simulation");
    expect(task.cron).toBe("0 */6 * * *");
  });

  it("sin proyectos activos → processed 0 y sin ejecutar runScenario", async () => {
    mockWhere.mockResolvedValue([]);

    const { periodicAdversarySimulation } = await import("./adversary.trigger");
    const task = periodicAdversarySimulation as unknown as AdversaryTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(0);
    expect(result.successCount).toBe(0);
    expect(mockRunScenario).not.toHaveBeenCalled();
  });

  it("con proyecto activo → omite escenarios manuales y ejecuta el resto", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunScenario.mockImplementation(async () => ({
      success: true,
      result: "detected",
      scoreImpact: 5,
    }));

    const { periodicAdversarySimulation } = await import("./adversary.trigger");
    const task = periodicAdversarySimulation as unknown as AdversaryTaskConfig;
    const result = await task.run(payload);

    // 5 escenarios agendados; T1078.001 es manual → se ejecutan 4
    expect(mockRunScenario).toHaveBeenCalledTimes(4);
    const calledMitres = mockRunScenario.mock.calls.map((c) => c[0].scenarioMitreId);
    expect(calledMitres).not.toContain("T1078.001");

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.totalScenariosRun).toBe(4);
    expect(result.totalPassed).toBe(4);
    expect(result.totalFailed).toBe(0);
  });

  it("resultados mixtos → passed/failed reflejados por escenario", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunScenario.mockImplementation(async (args) => {
      if (args.scenarioMitreId === "T1046") return { success: true, result: "missed" };
      if (args.scenarioMitreId === "T1490") return { success: false };
      return { success: true, result: "detected", scoreImpact: 5 };
    });

    const { periodicAdversarySimulation } = await import("./adversary.trigger");
    const task = periodicAdversarySimulation as unknown as AdversaryTaskConfig;
    const result = await task.run(payload);

    expect(result.totalScenariosRun).toBe(4);
    expect(result.totalPassed).toBe(2);
    expect(result.totalFailed).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it("error en un proyecto → se captura y el ciclo continúa", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunScenario.mockRejectedValue(new Error("sandbox timeout"));

    const { periodicAdversarySimulation } = await import("./adversary.trigger");
    const task = periodicAdversarySimulation as unknown as AdversaryTaskConfig;
    const result = await task.run(payload);

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.totalScenariosRun).toBe(0);

    const first = (result.summaries as Array<Record<string, unknown>>)[0]!;
    expect(first.error).toBe("sandbox timeout");
  });
});
