import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

type ExecBriefResult =
  | {
      ok: true;
      briefId: string | null;
      isFallback: boolean;
      modelUsed: string | null;
      fromCache: boolean;
    }
  | { ok: false; reason: string };

interface TaskConfig {
  id: string;
  retry: {
    maxAttempts: number;
    factor: number;
    minTimeoutInMs: number;
    maxTimeoutInMs: number;
    randomize: boolean;
  };
  run: (payload: { projectId: string; userId?: string | null }) => Promise<ExecBriefResult>;
}

const runExecBrief = vi.hoisted(() => vi.fn());

vi.mock("@trigger.dev/sdk", () => ({ task: vi.fn((config: unknown) => config) }));
vi.mock("@/server/ai/exec-brief", () => ({ runExecBrief }));

import { execBriefAfterAudit } from "./exec-brief.trigger";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterAll(() => {
  logSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  runExecBrief.mockResolvedValue({
    generated: true,
    isFallback: false,
    modelUsed: "gpt-5",
    briefId: "b-1",
    fromCache: false,
  });
});

describe("Trigger: exec-brief-after-audit", () => {
  const task = execBriefAfterAudit as unknown as TaskConfig;

  it("registra id y política de reintentos", () => {
    expect(task.id).toBe("exec-brief-after-audit");
    expect(task.retry).toEqual({
      maxAttempts: 3,
      factor: 1.8,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    });
  });

  it("brief generado → ok con metadatos y atribuye userId", async () => {
    const result = await task.run({ projectId: "p1", userId: "u1" });

    expect(result).toEqual({
      ok: true,
      briefId: "b-1",
      isFallback: false,
      modelUsed: "gpt-5",
      fromCache: false,
    });
    expect(runExecBrief).toHaveBeenCalledTimes(1);
    expect(runExecBrief).toHaveBeenCalledWith("p1", { userId: "u1" });
    expect(logSpy).toHaveBeenCalledWith(
      "[exec-brief] Listo: brief=b-1 fallback=false model=gpt-5 cache=false"
    );
  });

  it("userId ausente → lo pasa como null (sistema)", async () => {
    await task.run({ projectId: "p1" });

    expect(runExecBrief).toHaveBeenCalledWith("p1", { userId: null });
  });

  it("sin generación con error → ok false con ese motivo", async () => {
    runExecBrief.mockResolvedValue({
      generated: false,
      isFallback: false,
      modelUsed: null,
      briefId: null,
      fromCache: false,
      error: "sin auditorías completadas",
    });

    const result = await task.run({ projectId: "p1" });

    expect(result).toEqual({ ok: false, reason: "sin auditorías completadas" });
    expect(logSpy).toHaveBeenCalledWith(
      "[exec-brief] Sin generación: sin auditorías completadas"
    );
  });

  it("sin generación y sin error → fin limpio (brief vivo existente)", async () => {
    runExecBrief.mockResolvedValue({
      generated: false,
      isFallback: false,
      modelUsed: null,
      briefId: "b-1",
      fromCache: false,
    });

    const result = await task.run({ projectId: "p1" });

    expect(result).toEqual({ ok: false, reason: "brief ya existente" });
    expect(logSpy).toHaveBeenCalledWith("[exec-brief] Sin generación: brief vivo ya existente");
  });

  it("excepción del servicio → se propaga para el retry", async () => {
    runExecBrief.mockRejectedValue(new Error("openrouter caído"));

    await expect(task.run({ projectId: "p1" })).rejects.toThrow("openrouter caído");
    expect(logSpy).toHaveBeenCalledWith(
      "[exec-brief] Generando resumen ejecutivo para proyecto p1"
    );
  });
});
