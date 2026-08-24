/**
 * scenario-runner.test.ts — Tests unitarios para getOrCreateScenarioId,
 * runScenario y listScenariosWithRuns.
 *
 * Mock de Drizzle por tabla: cada consulta identifica la tabla por identidad
 * del objeto schema (los módulos de schema son reales, sin side-effects),
 * y las filas se configuran por tabla con:
 *   · selectQueue   — cola de resultados por tabla (cada select consume uno)
 *   · selectDefault — resultado estático por tabla (cuando la cola se agota)
 *   · returningQueue— filas devueltas por insert().returning()
 *   · inserted/updated/conflicts — registro de llamadas para aserciones
 *
 * Cubre:
 *   getOrCreateScenarioId (fix 0018): fast path, race path, target del
 *     onConflictDoNothing, fila irresoluble.
 *   runScenario (fix P0): scenario_id persistido, template creado cuando
 *     falta, escenario inexistente, findings [SIM]/[ADV-SANDBOX], output
 *     real del sandbox, gate ADVERSARY_SANDBOX_ENABLED=false, error de DB.
 *   listScenariosWithRuns (fix P0): atribución por scenario_id sin fuga,
 *     runs legacy con scenario_id NULL no atribuidos, detectionRate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock de @/shared/db (builder por tabla) + sandbox ──────────────────────
const { db, dbState, sandboxMock } = vi.hoisted(() => {
  const dbState = {
    selectQueue: new Map<any, any[][]>(),
    selectDefault: new Map<any, any[]>(),
    returningQueue: new Map<any, any[][]>(),
    inserted: [] as Array<{ table: any; values: any }>,
    updated: [] as Array<{ table: any; values: any; cond: any }>,
    selected: [] as Array<any>,
    conflicts: [] as Array<{ table: any; values: any; target: any }>,
    nextError: null as Error | null,
  };

  const takeRows = (table: any) => {
    if (dbState.nextError) {
      const e = dbState.nextError;
      dbState.nextError = null;
      throw e;
    }
    const q = dbState.selectQueue.get(table);
    if (q && q.length) return q.shift()!;
    return dbState.selectDefault.get(table) ?? [];
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const q: any = {
          where: vi.fn((cond: any) => ({
            orderBy: vi.fn((order: any) => ({
              limit: vi.fn(async (n: number) => {
                dbState.selected.push({ kind: "selectAll", table, cond, order, limit: n });
                return takeRows(table);
              }),
            })),
            limit: vi.fn(async (n: number) => {
              dbState.selected.push({ kind: "select", table, cond, limit: n });
              return takeRows(table);
            }),
          })),
        };
        // select().from(t) sin where (p.ej. catálogo en listScenariosWithRuns)
        // es awaitable: implementamos el protocolo thenable.
        q.then = (onFulfilled: any, onRejected: any) => {
          dbState.selected.push({ kind: "selectBare", table });
          return Promise.resolve()
            .then(() => takeRows(table))
            .then(onFulfilled, onRejected);
        };
        return q;
      }),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((values: any) => {
        dbState.inserted.push({ table, values });
        return {
          onConflictDoNothing: vi.fn(async (target: any) => {
            dbState.conflicts.push({ table, values, target });
          }),
          returning: vi.fn(async () => {
            if (dbState.nextError) {
              const e = dbState.nextError;
              dbState.nextError = null;
              throw e;
            }
            const q = dbState.returningQueue.get(table);
            return q && q.length ? q.shift()! : [];
          }),
        };
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((values: any) => ({
        where: vi.fn(async (cond: any) => {
          dbState.updated.push({ table, values, cond });
        }),
      })),
    })),
  };

  return {
    db,
    dbState,
    sandboxMock: {
      runSandboxedCommand: vi.fn<() => Promise<SandboxExecutionResult>>(async () => ({
        executed: false,
        status: "unsupported",
        output: "",
        findings: [],
        durationMs: 0,
      })),
    },
  };
});

vi.mock("@/shared/db", () => ({ db }));

// Sandbox mockeado: nunca ejecuta red real en tests unitarios.
vi.mock("./sandbox-executor", () => ({
  runSandboxedCommand: sandboxMock.runSandboxedCommand,
}));

import { getOrCreateScenarioId, runScenario, listScenariosWithRuns } from "./scenario-runner";
import { ADVERSARY_CATALOG } from "./catalog";
import { adversaryRuns, adversaryScenarios } from "@/shared/db/schemas/adversary";
import { projects } from "@/shared/db/schemas";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import type { SandboxExecutionResult } from "./sandbox-executor";

const SCENARIO = ADVERSARY_CATALOG[0]!; // T1078.001 — Default Credential Access (manual, high)

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectQueue = new Map();
  dbState.selectDefault = new Map();
  dbState.returningQueue = new Map();
  dbState.inserted = [];
  dbState.updated = [];
  dbState.selected = [];
  dbState.conflicts = [];
  dbState.nextError = null;
  sandboxMock.runSandboxedCommand.mockResolvedValue({
    executed: false,
    status: "unsupported",
    output: "",
    findings: [],
    durationMs: 0,
  });
  delete process.env.ADVERSARY_SANDBOX_ENABLED;
});

describe("getOrCreateScenarioId — race condition fix (0018)", () => {
  it("fast path: devuelve el id existente sin insertar", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[{ id: "existing-id" }]]);

    const id = await getOrCreateScenarioId(SCENARIO);

    expect(id).toBe("existing-id");
    expect(dbState.inserted.filter((i) => i.table === adversaryScenarios)).toHaveLength(0);
    expect(dbState.conflicts).toHaveLength(0);
  });

  it("race path: insert con onConflictDoNothing + re-select devuelve el id canónico", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[], [{ id: "winner-id" }]]);

    const id = await getOrCreateScenarioId(SCENARIO);

    expect(id).toBe("winner-id");
    const scenarioInserts = dbState.inserted.filter((i) => i.table === adversaryScenarios);
    expect(scenarioInserts).toHaveLength(1);
    expect((scenarioInserts[0]!.values as { mitreId?: string }).mitreId).toBe(SCENARIO.mitreId);
  });

  it("onConflictDoNothing usa target = adversaryScenarios.mitreId (índice único)", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[], [{ id: "canonical-id" }]]);

    await getOrCreateScenarioId(SCENARIO);

    expect(dbState.conflicts).toHaveLength(1);
    expect(dbState.conflicts[0]!.target).toEqual({ target: adversaryScenarios.mitreId });
  });

  it("fila irresoluble → lanza error", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[], []]);

    await expect(getOrCreateScenarioId(SCENARIO)).rejects.toThrow(
      /no se pudo resolver\/crear el escenario/
    );
  });
});

describe("runScenario — fix P0 (scenario_id persistido) + template + sandbox", () => {
  it("crea el template del escenario, persiste scenario_id y actualiza la run (output simulado)", async () => {
    // getOrCreateScenarioId: fast path miss → insert template → re-read
    dbState.selectQueue.set(adversaryScenarios, [[], [{ id: "scenario-1" }]]);
    dbState.returningQueue.set(adversaryRuns, [[{ id: "run-1" }]]);
    dbState.selectDefault.set(projects, [{ domain: "example.com" }]);

    const result = await runScenario({
      scenarioMitreId: "T1078.001",
      projectId: "proj-1",
      investigationId: "inv-1",
      detectedBy: "Manual",
    });

    expect(result.success).toBe(true);
    expect(result.runId).toBe("run-1");
    expect(result.result).toBe("missed");
    expect(result.scoreImpact).toBe(-10); // high
    expect(result.output).toContain("Adversary Simulation Engine");

    // Template creado (insert en adversaryScenarios) con los datos del catálogo
    const scenarioInserts = dbState.inserted.filter((i) => i.table === adversaryScenarios);
    expect(scenarioInserts).toHaveLength(1);
    expect((scenarioInserts[0]!.values as { mitreId?: string }).mitreId).toBe("T1078.001");

    // FIX P0: la run inserta con scenario_id = id persistido del template
    const runInsert = dbState.inserted.find((i) => i.table === adversaryRuns)!;
    expect((runInsert.values as { scenarioId?: string }).scenarioId).toBe("scenario-1");
    expect((runInsert.values as { projectId?: string }).projectId).toBe("proj-1");

    // Update de la run con resultado y scoreImpact
    const runUpdate = dbState.updated.find((u) => u.table === adversaryRuns)!;
    expect(runUpdate.values).toMatchObject({
      status: "completed",
      result: "missed",
      scoreImpact: -10,
      detectedBy: "Manual",
    });
    expect(runUpdate.values.output).toBe(result.output);

    // Finding base [SIM] con evidence.sandbox = null (sin ejecución real)
    const simFinding = dbState.inserted.find(
      (i) => i.table === intelligenceFindings && (i.values as { title?: string }).title?.startsWith("[SIM]")
    )!;
    expect((simFinding.values as { title: string }).title).toBe(`[SIM] ${SCENARIO.name}`);
    expect((simFinding.values as { severity: string }).severity).toBe("high");
    expect((simFinding.values as { affectedAsset: string }).affectedAsset).toBe("example.com");
    expect(((simFinding.values as any).evidence as { sandbox: unknown }).sandbox).toBeNull();

    // Ejecutor manual → el sandbox NUNCA se invoca
    expect(sandboxMock.runSandboxedCommand).not.toHaveBeenCalled();
  });

  it("NO crea el template cuando el escenario ya existe (fast path) y atribuye la run", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[{ id: "existing-id" }]]);
    dbState.returningQueue.set(adversaryRuns, [[{ id: "run-1" }]]);
    dbState.selectDefault.set(projects, [{ domain: "example.com" }]);

    const result = await runScenario({
      scenarioMitreId: "T1078.001",
      projectId: "proj-1",
    });

    expect(result.success).toBe(true);
    expect(dbState.conflicts).toHaveLength(0);
    expect(dbState.inserted.filter((i) => i.table === adversaryScenarios)).toHaveLength(0);
    const runInsert = dbState.inserted.find((i) => i.table === adversaryRuns)!;
    expect((runInsert.values as { scenarioId?: string }).scenarioId).toBe("existing-id");
  });

  it("escenario inexistente en el catálogo → error sin tocar la BD", async () => {
    const result = await runScenario({ scenarioMitreId: "T9999", projectId: "proj-1" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no encontrado");
    expect(dbState.selected).toHaveLength(0);
    expect(dbState.inserted).toHaveLength(0);
  });

  it("ejecutor http: usa el output REAL del sandbox y crea findings [ADV-SANDBOX]", async () => {
    dbState.selectQueue.set(adversaryScenarios, [[{ id: "scenario-1" }]]);
    dbState.returningQueue.set(adversaryRuns, [[{ id: "run-1" }]]);
    dbState.selectDefault.set(projects, [{ domain: "example.com" }]);

    sandboxMock.runSandboxedCommand.mockResolvedValue({
      executed: true,
      status: "ok",
      output: "[HTTP GET] /?id=1' OR 1=1-- → 200",
      findings: [
        {
          title: "SQLi probe respondió 200 (endpoint sensible expuesto)",
          description: "El endpoint respondió 200 a un probe GET.",
          severity: "high",
          evidence: { method: "GET", path: "/" },
        },
      ],
      durationMs: 12,
    });

    const result = await runScenario({
      scenarioMitreId: "T1190",
      projectId: "proj-1",
      investigationId: "inv-1",
    });

    expect(result.success).toBe(true);
    expect(result.scoreImpact).toBe(-15); // critical
    expect(result.output).toBe("[HTTP GET] /?id=1' OR 1=1-- → 200");

    // El sandbox se invocó con el target resuelto del proyecto
    expect(sandboxMock.runSandboxedCommand).toHaveBeenCalledWith(
      expect.objectContaining({ executorType: "http", target: "example.com", timeoutMs: 15_000 })
    );

    // [SIM] con evidence.sandbox real
    const simFinding = dbState.inserted.find(
      (i) => i.table === intelligenceFindings && (i.values as { title?: string }).title?.startsWith("[SIM]")
    )!;
    const simSandbox = (simFinding.values as any).evidence.sandbox as {
      executed: boolean; status: string; findingsCount: number;
    };
    expect(simSandbox).toMatchObject({ executed: true, status: "ok", findingsCount: 1 });

    // [ADV-SANDBOX] con evidencia del finding parseado + mitreId del escenario
    const advFinding = dbState.inserted.find(
      (i) => i.table === intelligenceFindings && (i.values as { title?: string }).title?.startsWith("[ADV-SANDBOX]")
    )!;
    expect((advFinding.values as { severity: string }).severity).toBe("high");
    const advEvidence = (advFinding.values as any).evidence as Record<string, unknown>;
    expect(advEvidence).toMatchObject({ mitreId: "T1190", sandboxStatus: "ok" });
  });

  it("gate ADVERSARY_SANDBOX_ENABLED=false → el sandbox NO se ejecuta y se usa el fallback simulado", async () => {
    process.env.ADVERSARY_SANDBOX_ENABLED = "false";
    dbState.selectQueue.set(adversaryScenarios, [[{ id: "scenario-1" }]]);
    dbState.returningQueue.set(adversaryRuns, [[{ id: "run-1" }]]);
    dbState.selectDefault.set(projects, [{ domain: "example.com" }]);

    const result = await runScenario({ scenarioMitreId: "T1190", projectId: "proj-1" });

    expect(result.success).toBe(true);
    expect(sandboxMock.runSandboxedCommand).not.toHaveBeenCalled();
    expect(result.output).toContain("Adversary Simulation Engine");
  });

  it("error de BD durante la ejecución → success:false con el mensaje", async () => {
    dbState.nextError = new Error("boom de DB");
    const result = await runScenario({ scenarioMitreId: "T1078.001", projectId: "proj-1" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom de DB");
  });
});

describe("listScenariosWithRuns — fix P0 (atribución por scenario_id, sin fuga)", () => {
  it("atribuye cada run a su escenario vía scenario_id y calcula detectionRate", async () => {
    const d1 = new Date("2026-01-01T00:00:00Z");
    const d2 = new Date("2026-01-02T00:00:00Z");
    const d3 = new Date("2026-01-03T00:00:00Z");

    dbState.selectDefault.set(adversaryRuns, [
      { id: "r1", scenarioId: "scenario-1", result: "detected", createdAt: d3 },
      { id: "r2", scenarioId: "scenario-1", result: "missed", createdAt: d2 },
      { id: "r3", scenarioId: "scenario-2", result: "detected", createdAt: d1 },
    ]);
    dbState.selectDefault.set(adversaryScenarios, [
      { id: "scenario-1", mitreId: "T1078.001" },
      { id: "scenario-2", mitreId: "T1046" },
      { id: "scenario-3", mitreId: "T1190" },
    ]);

    const { catalog, runs } = await listScenariosWithRuns("proj-1");

    const t1078 = catalog.find((s) => s.mitreId === "T1078.001")!;
    expect(t1078.totalRuns).toBe(2);
    expect(t1078.detectedCount).toBe(1);
    expect(t1078.detectionRate).toBe(50);
    expect(t1078.lastRun?.id).toBe("r1"); // run más reciente (createdAt desc)

    const t1046 = catalog.find((s) => s.mitreId === "T1046")!;
    expect(t1046.totalRuns).toBe(1);
    expect(t1046.detectedCount).toBe(1);
    expect(t1046.detectionRate).toBe(100);

    // Escenario sin runs → totalRuns 0, detectionRate null
    const t1190 = catalog.find((s) => s.mitreId === "T1190")!;
    expect(t1190.totalRuns).toBe(0);
    expect(t1190.detectionRate).toBeNull();

    // Passthrough raw de runs (para el coverage del GET)
    expect(runs).toHaveLength(3);
  });

  it("runs legacy con scenario_id NULL NO se atribuyen a ningún escenario (fix P0)", async () => {
    dbState.selectDefault.set(adversaryRuns, [
      { id: "legacy-1", scenarioId: null, result: "detected", createdAt: new Date() },
      { id: "r1", scenarioId: "scenario-1", result: "missed", createdAt: new Date() },
    ]);
    dbState.selectDefault.set(adversaryScenarios, [{ id: "scenario-1", mitreId: "T1078.001" }]);

    const { catalog, runs } = await listScenariosWithRuns("proj-1");

    const t1078 = catalog.find((s) => s.mitreId === "T1078.001")!;
    // Solo cuenta el run con scenario_id real — el NULL no fuga
    expect(t1078.totalRuns).toBe(1);
    expect(t1078.detectedCount).toBe(0);
    expect(t1078.detectionRate).toBe(0);

    // El run legacy sigue visible en el raw passthrough
    expect(runs.some((r) => r.id === "legacy-1")).toBe(true);
  });
});
