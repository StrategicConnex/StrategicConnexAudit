import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * eval-runner.test.ts — Tests del eval continuo del pool (Sprint 4, idea #8).
 *
 * Mocks: `@/shared/db` (insert/select encadenados) y `callAIWithFallback`
 * dentro de `./ai-router` (el resto del módulo pasa real: TASK_ROUTING,
 * MODEL_CAPABILITIES, prompt-version). El dataset dorado es el real
 * (adversary-golden.json).
 */

// ─── Estado de los mocks ────────────────────────────────────────────────────

const insertedRows: Array<Record<string, unknown>> = [];

vi.mock("@/shared/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/db/schemas/index")>();
  return {
    ...actual,
    directDb: {
      insert: vi.fn(() => ({
        values: async (payload: Record<string, unknown>) => {
          insertedRows.push(payload);
          return { id: "row" };
        },
      })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            groupBy: () => ({
              orderBy: async () => reportRows,
            }),
          }),
        }),
      })),
    },
  };
});

vi.mock("./ai-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai-router")>();
  return {
    ...actual,
    callAIWithFallback: vi.fn(),
  };
});

import { runModelEval, proposeAdversaryChain, EVAL_MODELS } from "./eval-runner";
import { callAIWithFallback, TASK_ROUTING } from "./ai-router";
import { promptVersion } from "./prompt-version";
import { TRIAGE_SYSTEM } from "@/server/intelligence/adversary/assessment/ai-analyst";
import type { GoldenCase } from "./eval/triage-scorer";

const mockAI = vi.mocked(callAIWithFallback);

let reportRows: Array<{
  model: string;
  promptVersion: string;
  runs: number;
  avgScore: number;
  passRate: number;
  errorRate: number;
  avgLatencyMs: number;
  lastRun: Date | null;
}> = [];

/** Caso mínimo equivalente a "sql-injection-login" del dataset real. */
const CASO: GoldenCase = {
  id: "sql-injection-login",
  evidence: {
    target: "tienda.example.com",
    checks: [
      {
        id: "http-fuzz-login",
        status: "vulnerable",
        severity: "critical",
        summary: "El parámetro 'email' refleja comilla simple sin escapar",
        evidence: "payload `' OR '1'='1` devolvió 200 con 1420 filas",
      },
    ],
  },
  expect: {
    minFindings: 1,
    maxFindings: 4,
    mustContain: ["SQL", "inyecci"],
    mustIncludeSeverity: ["critical", "high"],
  },
};

function aiJson(vulns: Array<Record<string, unknown>>) {
  return {
    success: true,
    content: JSON.stringify({ vulnerabilities: vulns }),
    modelUsed: "nvidia/nemotron-3-ultra-550b-a55b:free",
    latencyMs: 1234,
    usage: { tokensIn: 100, tokensOut: 200 },
  } as ReturnType<typeof Object> as Awaited<ReturnType<typeof callAIWithFallback>>;
}

const VULN_OK = {
  title: "Inyección SQL en login",
  severity: "critical",
  cvssScore: 9.1,
  cweId: "CWE-89",
  description: "El parámetro email permite inyección SQL.",
  evidenceSummary: "Payload ' OR '1'='1 devolvió 200.",
  remediation: ["Usar consultas parametrizadas"],
};

beforeEach(() => {
  mockAI.mockReset();
  insertedRows.length = 0;
  reportRows = [];
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("runModelEval", () => {
  it("llama a la IA con modelOverride y responseFormat json_object", async () => {
    mockAI.mockResolvedValue(aiJson([VULN_OK]));
    await runModelEval("modelo-x:free", { cases: [CASO] });

    expect(mockAI).toHaveBeenCalledTimes(1);
    const opts = mockAI.mock.calls[0]![0]!;
    expect(opts.modelOverride).toBe("modelo-x:free");
    expect(opts.responseFormat).toEqual({ type: "json_object" });
    expect(opts.taskType).toBe("adversary-analysis");
    expect(opts.temperature).toBe(0);
  });

  it("reproducible: mismo prompt → mismo prompt_version (y usa el system de producción)", async () => {
    mockAI.mockResolvedValue(aiJson([VULN_OK]));
    const r1 = await runModelEval("a:free", { cases: [CASO] });
    const r2 = await runModelEval("b:free", { cases: [CASO] });

    expect(r1.results[0]!.promptVersion).toBe(r2.results[0]!.promptVersion);
    expect(r1.results[0]!.promptVersion).toMatch(/^[0-9a-f]{16}$/);
    // El system prompt del eval es el de producción (fuente única) + variante B.
    const sys = mockAI.mock.calls[0]![0]!.messages[0]!.content;
    expect(sys).toContain(TRIAGE_SYSTEM.slice(0, 40));
  });

  it("el prompt_version cambia si cambia el system prompt", async () => {
    mockAI.mockResolvedValue(aiJson([VULN_OK]));
    const r1 = await runModelEval("a:free", { cases: [CASO] });
    // Simular cambio de prompt de producción:
    const pvProd1 = promptVersion([
      { role: "system", content: mockAI.mock.calls[0]![0]!.messages[0]!.content },
      { role: "user", content: mockAI.mock.calls[0]![0]!.messages[1]!.content },
    ]);
    const pvProd2 = promptVersion([
      { role: "system", content: `${mockAI.mock.calls[0]![0]!.messages[0]!.content} (v2)` },
      { role: "user", content: mockAI.mock.calls[0]![0]!.messages[1]!.content },
    ]);
    expect(pvProd1).toBe(r1.results[0]!.promptVersion);
    expect(pvProd2).not.toBe(pvProd1);
  });

  it("puntúa y persiste: fila con score, passed, tokens y prompt_version", async () => {
    mockAI.mockResolvedValue(aiJson([VULN_OK]));
    const res = await runModelEval("a:free", { cases: [CASO] });

    expect(res.okCalls).toBe(1);
    expect(res.results[0]!.score).toBeGreaterThanOrEqual(80);
    expect(res.results[0]!.errored).toBe(false);
    expect(res.results[0]!.tokensIn).toBe(100);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      taskType: "adversary-analysis",
      caseId: "sql-injection-login",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      score: res.results[0]!.score,
      passed: true,
    });
    expect(insertedRows[0]!.promptVersion).toMatch(/^[0-9a-f]{16}$/);
  });

  it("salida no-JSON del modelo → errored, score 0 y detalle explicativo", async () => {
    mockAI.mockResolvedValue({
      success: true,
      content: "lo siento, no puedo",
      modelUsed: "a:free",
      latencyMs: 100,
    } as Awaited<ReturnType<typeof callAIWithFallback>>);
    const res = await runModelEval("a:free", { cases: [CASO] });

    expect(res.results[0]!.errored).toBe(true);
    expect(res.results[0]!.score).toBe(0);
    expect(res.results[0]!.detail).toContain("no-JSON");
    expect(insertedRows[0]!.errored).toBe(true);
  });

  it("fallo de la llamada (error del router) → 0 y sin explotar", async () => {
    mockAI.mockResolvedValue({
      success: false,
      content: "",
      modelUsed: "none",
      latencyMs: 5,
      error: "sin key",
    } as Awaited<ReturnType<typeof callAIWithFallback>>);
    const res = await runModelEval("a:free", { cases: [CASO] });
    expect(res.results[0]!.errored).toBe(true);
    expect(res.results[0]!.detail).toBe("sin key");
  });

  it("usa el dataset real cuando no se pasan casos", async () => {
    mockAI.mockResolvedValue(aiJson([VULN_OK]));
    const res = await runModelEval("a:free");
    // adversary-golden.json tiene 10 casos.
    expect(res.results.length).toBe(10);
    expect(mockAI).toHaveBeenCalledTimes(10);
  });
});

describe("proposeAdversaryChain", () => {
  it("sin datos suficientes → cadena actual intacta (guardrail)", async () => {
    reportRows = [];
    const p = await proposeAdversaryChain({ minRuns: 10 });
    expect(p.proposed).toEqual(TASK_ROUTING["adversary-analysis"]);
  });

  it("reordena: los modelos con mejor score suben y los malos bajan", async () => {
    const chain = TASK_ROUTING["adversary-analysis"];
    const m1 = chain[0]!; // buen score → arriba
    const m2 = chain[1]!;
    reportRows = [
      { model: m2, promptVersion: "x", runs: 20, avgScore: 95, passRate: 100, errorRate: 0, avgLatencyMs: 1000, lastRun: new Date() },
      { model: m1, promptVersion: "x", runs: 20, avgScore: 60, passRate: 40, errorRate: 5, avgLatencyMs: 1000, lastRun: new Date() },
    ];
    const p = await proposeAdversaryChain({ minRuns: 10 });
    expect(p.proposed[0]).toBe(m2);
    expect(p.reasons.join(" ")).toContain(m2.slice(0, 10));
  });

  it("nunca propone una cadena con menos de 2 modelos", async () => {
    const chain = TASK_ROUTING["adversary-analysis"];
    reportRows = [
      { model: chain[0]!, promptVersion: "x", runs: 20, avgScore: 20, passRate: 0, errorRate: 90, avgLatencyMs: 1000, lastRun: new Date() },
    ];
    const p = await proposeAdversaryChain({ minRuns: 10 });
    expect(p.proposed.length).toBeGreaterThanOrEqual(2);
    // El único modelo con datos (malo) debe quedar al final, no eliminado:
    expect(p.proposed).toContain(chain[0]!);
  });
});

describe("EVAL_MODELS", () => {
  it("deriva del pool verificado (MODEL_CAPABILITIES)", () => {
    expect(EVAL_MODELS.length).toBeGreaterThanOrEqual(5);
    expect(EVAL_MODELS).toContain("nvidia/nemotron-3-ultra-550b-a55b:free");
  });
});
