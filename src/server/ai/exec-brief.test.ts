import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * exec-brief.test.ts — Tests del resumen ejecutivo (Sprint 3, idea #2).
 *
 * Mocks:
 *  - `@/shared/db`: consultas de collectBriefInput (projects/audits/issues).
 *  - `@/shared/db/schemas/exec-briefs`: helpers de persistencia (findLatestBrief
 *    / upsertExecBrief) para no depender de BD real.
 *  - `./ai-router`: callAIWithFallback + getNoApiKeyResponse.
 */

// ─── Estado del mock de BD ──────────────────────────────────────────────────

let projectRows: Array<Record<string, unknown>> = [];
let auditRows: Array<Record<string, unknown>> = [];
let issueRows: Array<{ severity: string; title: string }> = [];

vi.mock("@/shared/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/db/schemas/index")>();
  const { getTableName } = await import("drizzle-orm");

  function rowsFor(table: unknown): Array<unknown> {
    const name = getTableName(table as never);
    switch (name) {
      case "projects": return projectRows;
      case "audits": return auditRows;
      case "issues": return issueRows;
      default: return [];
    }
  }

  return {
    ...actual,
    directDb: {
      select: vi.fn(() => ({
        from: (table: unknown) => {
          const rows = () => rowsFor(table);
          return {
            where: () => ({
              orderBy: () => ({ limit: async () => rows() }),
              limit: async () => rows(),
              // Thenable: la query de issues se await-ea sin .limit()
              then: (res: (v: unknown) => void) => Promise.resolve(rows()).then(res),
            }),
          };
        },
      })),
    },
  };
});

const findLatestBriefMock = vi.hoisted(() => vi.fn());
const upsertExecBriefMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/db/schemas/exec-briefs", () => ({
  execBriefs: { id: "exec_briefs(mock)" },
  findLatestBrief: findLatestBriefMock,
  upsertExecBrief: upsertExecBriefMock,
}));

vi.mock("./ai-router", () => ({
  callAIWithFallback: vi.fn(),
  getNoApiKeyResponse: (_t: string, locale: string) => `no-key-${locale}`,
}));

import { runExecBrief, buildBriefPrompt, collectBriefInput } from "./exec-brief";
import { callAIWithFallback } from "./ai-router";

const mockAI = vi.mocked(callAIWithFallback);

const PROYECTO = [{ id: "p1", domain: "ejemplo.com" }];
const AUDITORIA = [{ id: "a1", createdAt: new Date("2026-09-21T10:00:00Z") }];
const ISSUES = [
  { severity: "critical", title: "Puerto expuesto" },
  { severity: "critical", title: "Certificado TLS vencido" },
  { severity: "warning", title: "Falta CSP" },
  { severity: "info", title: "Cabecera informativa" },
];

const AI_OK = {
  success: true,
  content: JSON.stringify({
    headline: "La seguridad de ejemplo.com necesita atención prioritaria",
    summary:
      "La última auditoría identificó dos problemas críticos que deben resolverse esta semana. " +
      "El resto de hallazgos son de gravedad moderada o baja. Con las acciones indicadas, " +
      "el estado general del sitio puede mejorar de forma sostenida durante el próximo mes.",
    topRisks: ["Puerto de gestión expuesto a internet", "Certificado TLS vencido"],
    nextSteps: ["Restringir el acceso al puerto", "Renovar el certificado TLS"],
  }),
  modelUsed: "test-model",
  fromCache: false,
} as unknown as Awaited<ReturnType<typeof callAIWithFallback>>;

beforeEach(() => {
  vi.clearAllMocks();
  projectRows = PROYECTO;
  auditRows = AUDITORIA;
  issueRows = ISSUES;
  findLatestBriefMock.mockResolvedValue(null);
  upsertExecBriefMock.mockResolvedValue([{ id: "b1" }]);
  mockAI.mockResolvedValue(AI_OK);
});

describe("exec-brief — recolección de datos", () => {
  it("construye BriefInput con severidades, top issues y score", async () => {
    const input = await collectBriefInput("p1");
    expect(input).not.toBeNull();
    expect(input!.bySeverity).toEqual({ critical: 2, warning: 1, info: 1 });
    // 2*10 + 1*3 + 1*1 = 24 → 76
    expect(input!.healthScore).toBe(76);
    expect(input!.auditId).toBe("a1");
    expect(input!.topIssues[0].severity).toBe("critical");
  });

  it("devuelve null sin auditorías completadas", async () => {
    auditRows = [];
    const input = await collectBriefInput("p1");
    expect(input).toBeNull();
  });
});

describe("exec-brief — runExecBrief", () => {
  it("happy path: genera, valida con Zod y persiste el brief", async () => {
    const res = await runExecBrief("p1", { userId: "u1" });

    expect(res.generated).toBe(true);
    expect(res.isFallback).toBe(false);
    expect(res.modelUsed).toBe("test-model");
    expect(res.briefId).toBe("b1");
    // El prompt pide JSON, español ejecutivo y cache por auditoría.
    const calledWith = mockAI.mock.calls[0][0];
    expect(calledWith.taskType).toBe("exec-brief");
    expect(calledWith.responseFormat).toEqual({ type: "json_object" });
    expect(calledWith.cacheScope).toContain("brief:p1:");
    // Persistencia con markdown-lite estructurado.
    const persisted = upsertExecBriefMock.mock.calls[0][0];
    expect(persisted.isFallback).toBe(false);
    expect(persisted.auditId).toBe("a1");
    expect(String(persisted.content)).toContain("## La seguridad de ejemplo.com");
    expect(String(persisted.content)).toContain("**Próximos pasos**");
  });

  it("reutiliza el brief vivo sin gastar llamada IA (idempotencia)", async () => {
    findLatestBriefMock.mockResolvedValue({ id: "b0", isFallback: false });

    const res = await runExecBrief("p1");

    expect(res.generated).toBe(false);
    expect(res.briefId).toBe("b0");
    expect(mockAI).not.toHaveBeenCalled();
    expect(upsertExecBriefMock).not.toHaveBeenCalled();
  });

  it("sin key: persiste fila fallback con mensaje de degradación graciosa", async () => {
    mockAI.mockResolvedValue({
      success: false,
      error: "no key",
    } as unknown as Awaited<ReturnType<typeof callAIWithFallback>>);

    const res = await runExecBrief("p1");

    expect(res.generated).toBe(true);
    expect(res.isFallback).toBe(true);
    const persisted = upsertExecBriefMock.mock.calls[0][0];
    expect(persisted.isFallback).toBe(true);
    expect(String(persisted.content)).toContain("no-key-es");
  });

  it("salida inválida del modelo: no persiste y reporta error", async () => {
    mockAI.mockResolvedValue({
      success: true,
      content: JSON.stringify({ headline: "corto" }), // sin summary/nextSteps
      modelUsed: "m",
      fromCache: false,
    } as unknown as Awaited<ReturnType<typeof callAIWithFallback>>);

    const res = await runExecBrief("p1");

    expect(res.generated).toBe(false);
    expect(res.isFallback).toBe(true);
    expect(res.error).toContain("salida inválida");
    expect(upsertExecBriefMock).not.toHaveBeenCalled();
  });

  it("no-JSON del modelo: no persiste y reporta error", async () => {
    mockAI.mockResolvedValue({
      success: true,
      content: "esto no es json",
      modelUsed: "m",
      fromCache: false,
    } as unknown as Awaited<ReturnType<typeof callAIWithFallback>>);

    const res = await runExecBrief("p1");
    expect(res.generated).toBe(false);
    expect(res.error).toContain("salida inválida");
  });

  it("sin auditorías completadas: termina limpio sin llamada IA", async () => {
    auditRows = [];
    const res = await runExecBrief("p1");
    expect(res.generated).toBe(false);
    expect(res.error).toContain("sin auditorías");
    expect(mockAI).not.toHaveBeenCalled();
  });

  it("el prompt ejecutivo prohibe jerga y pide máximo 3 acciones", () => {
    const prompt = buildBriefPrompt({
      bySeverity: { critical: 1, warning: 2, info: 3 },
      topIssues: [{ title: "X", severity: "critical" }],
      healthScore: 55,
      domain: "d.com",
      auditDate: "2026-09-21T00:00:00.000Z",
    });
    expect(prompt).toContain("NO técnico");
    expect(prompt).toContain("máximo 3 riesgos");
  });
});
