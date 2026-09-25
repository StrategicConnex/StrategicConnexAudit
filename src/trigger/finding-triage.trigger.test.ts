import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

interface TriageSweepResult {
  processed: number;
  failed: number;
  modelUsed: string | null;
  updated: number;
  calls: number;
  error?: string;
}

interface TaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { projectId: string; userId?: string | null }) => Promise<
    TriageSweepResult & { success: boolean; projectId: string }
  >;
}

interface ScheduleConfig {
  id: string;
  cron: string;
  retry: { maxAttempts: number };
  run: (payload: { timestamp: Date }) => Promise<{
    success: boolean;
    projectsScanned: number;
    findingsUpdated: number;
    failures: number;
    perProject: Array<{ projectId: string; updated: number; calls: number; error?: string }>;
    timestamp: string;
  }>;
}

const runFindingTriageSweep = vi.hoisted(() => vi.fn());
const TRIAGE_BATCH_SIZE = vi.hoisted(() => 40);
const projects = vi.hoisted(() => ({ id: "id" }));
const select = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: unknown) => config),
  schedules: { task: vi.fn((config: unknown) => config) },
}));
vi.mock("@/shared/db", () => ({ directDb: { select } }));
vi.mock("@/shared/db/schemas", () => ({ projects }));
vi.mock("@/server/ai/finding-triage", () => ({ runFindingTriageSweep, TRIAGE_BATCH_SIZE }));

import { triageAfterAudit, findingTriageSweep } from "./finding-triage.trigger";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

const OK: TriageSweepResult = {
  processed: 3,
  failed: 0,
  modelUsed: "gpt-5",
  updated: 3,
  calls: 1,
};

afterAll(() => {
  logSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  runFindingTriageSweep.mockResolvedValue({ ...OK });
  select.mockReturnValue({ from });
  from.mockReturnValue({ limit });
  limit.mockResolvedValue([]);
});

describe("Trigger: triage-after-audit", () => {
  const task = triageAfterAudit as unknown as TaskConfig;

  it("registra id y política de reintentos", () => {
    expect(task.id).toBe("triage-after-audit");
    expect(task.retry.maxAttempts).toBe(3);
  });

  it("sweep sin error → success y options por defecto (sistema)", async () => {
    const result = await task.run({ projectId: "p1" });

    expect(result).toEqual({ ...OK, success: true, projectId: "p1" });
    expect(runFindingTriageSweep).toHaveBeenCalledTimes(1);
    expect(runFindingTriageSweep).toHaveBeenCalledWith("p1", {
      userId: null,
      maxCalls: 3,
      batchSize: TRIAGE_BATCH_SIZE,
    });
    expect(logSpy).toHaveBeenCalledWith("[Triage] Post-audit para proyecto p1");
    expect(logSpy).toHaveBeenCalledWith(
      "[Triage] Proyecto p1: updated=3 calls=1"
    );
  });

  it("userId presente → lo atribuye al sweep", async () => {
    await task.run({ projectId: "p1", userId: "u1" });

    expect(runFindingTriageSweep).toHaveBeenCalledWith("p1", {
      userId: "u1",
      maxCalls: 3,
      batchSize: TRIAGE_BATCH_SIZE,
    });
  });

  it("error con findings actualizados → success true (fire-and-forget)", async () => {
    runFindingTriageSweep.mockResolvedValue({
      ...OK,
      updated: 2,
      error: "parcial: 1 finding quedó sin clasificar",
    });

    const result = await task.run({ projectId: "p1" });

    expect(result.success).toBe(true);
    expect(result.updated).toBe(2);
  });

  it("error sin progreso → success false y error truncado en el log", async () => {
    const longError = "rate limit ".repeat(30).trim(); // > 200 chars
    runFindingTriageSweep.mockResolvedValue({
      processed: 0,
      failed: 0,
      modelUsed: null,
      updated: 0,
      calls: 1,
      error: longError,
    });

    const result = await task.run({ projectId: "p1" });

    expect(result.success).toBe(false);
    expect(result.error).toBe(longError);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`error=${longError.slice(0, 200)}`)
    );
  });

  it("excepción del sweep → se propaga (retry de Trigger.dev)", async () => {
    runFindingTriageSweep.mockRejectedValue(new Error("db down"));

    await expect(task.run({ projectId: "p1" })).rejects.toThrow("db down");
  });
});

describe("Trigger: finding-triage-sweep", () => {
  const task = findingTriageSweep as unknown as ScheduleConfig;
  const payload = { timestamp: new Date("2026-09-24T04:00:00.000Z") };

  it("registra id, cron diario 04:00 UTC y reintentos", () => {
    expect(task.id).toBe("finding-triage-sweep");
    expect(task.cron).toBe("0 4 * * *");
    expect(task.retry.maxAttempts).toBe(2);
  });

  it("sin proyectos → barrido vacío sin llamar al triage", async () => {
    const result = await task.run(payload);

    expect(result).toEqual({
      success: true,
      projectsScanned: 0,
      findingsUpdated: 0,
      failures: 0,
      perProject: [],
      timestamp: "2026-09-24T04:00:00.000Z",
    });
    expect(select).toHaveBeenCalledWith({ id: projects.id });
    expect(from).toHaveBeenCalledWith(projects);
    expect(limit).toHaveBeenCalledWith(500);
    expect(runFindingTriageSweep).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[TriageSweep] Fin: proyectos=0 actualizados=0 fallos=0"
    );
  });

  it("dos proyectos → agrega actualizados por proyecto con techo de llamadas", async () => {
    limit.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    runFindingTriageSweep.mockImplementation(async (projectId: string) =>
      projectId === "p1" ? { ...OK, updated: 3 } : { ...OK, updated: 1, calls: 2 }
    );

    const result = await task.run(payload);

    expect(result.success).toBe(true);
    expect(result.projectsScanned).toBe(2);
    expect(result.findingsUpdated).toBe(4);
    expect(result.failures).toBe(0);
    expect(result.perProject).toEqual([
      { projectId: "p1", updated: 3, calls: 1 },
      { projectId: "p2", updated: 1, calls: 2 },
    ]);
    expect(runFindingTriageSweep).toHaveBeenCalledWith("p1", {
      userId: null,
      maxCalls: 4,
      batchSize: TRIAGE_BATCH_SIZE,
    });
    expect(runFindingTriageSweep).toHaveBeenCalledWith("p2", {
      userId: null,
      maxCalls: 4,
      batchSize: TRIAGE_BATCH_SIZE,
    });
    expect(logSpy).toHaveBeenCalledWith(
      "[TriageSweep] Fin: proyectos=2 actualizados=4 fallos=0"
    );
  });

  it("error sin progreso → cuenta fallo y trunca el mensaje a 300 chars", async () => {
    limit.mockResolvedValue([{ id: "p1" }]);
    const longError = "boom ".repeat(100); // 499 chars
    runFindingTriageSweep.mockResolvedValue({
      processed: 0,
      failed: 0,
      modelUsed: null,
      updated: 0,
      calls: 1,
      error: longError,
    });

    const result = await task.run(payload);

    expect(result.failures).toBe(1);
    expect(result.perProject).toEqual([
      { projectId: "p1", updated: 0, calls: 1, error: longError.slice(0, 300) },
    ]);
    expect(result.perProject[0]!.error).toHaveLength(300);
    expect(result.findingsUpdated).toBe(0);
  });

  it("excepción en un proyecto → se captura y no tumba el barrido", async () => {
    limit.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    runFindingTriageSweep
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ...OK, updated: 4 });

    const result = await task.run(payload);

    expect(result.success).toBe(true);
    expect(result.projectsScanned).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.findingsUpdated).toBe(4);
    expect(result.perProject).toEqual([
      { projectId: "p1", updated: 0, calls: 0, error: "boom" },
      { projectId: "p2", updated: 4, calls: 1 },
    ]);
  });

  it("error con findings actualizados → no cuenta como fallo", async () => {
    limit.mockResolvedValue([{ id: "p1" }]);
    runFindingTriageSweep.mockResolvedValue({
      ...OK,
      updated: 5,
      error: "timeout a mitad de batch",
    });

    const result = await task.run(payload);

    expect(result.failures).toBe(0);
    expect(result.findingsUpdated).toBe(5);
    expect(result.perProject).toEqual([
      { projectId: "p1", updated: 5, calls: 1, error: "timeout a mitad de batch" },
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      "[TriageSweep] Inicio 2026-09-24T04:00:00.000Z"
    );
  });
});
