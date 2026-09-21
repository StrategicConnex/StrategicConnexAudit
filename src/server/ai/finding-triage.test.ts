import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * finding-triage.test.ts — Tests del triage automático (Sprint 2, idea #1).
 *
 * Mocks: `@/shared/db` (cadenas drizzle select/update) y `./ai-router`
 * (callAIWithFallback). El schema real de drizzle se usa para que and/eq/isNull
 * construyan condiciones sin conexión.
 */

// ─── Estado del mock de BD ───────────────────────────────────────────────────

let pendingRows: Array<{
  id: string;
  title: string;
  description: string;
  severity: string;
  affectedAsset: string | null;
}> = [];
let updateReturn: Array<{ id: string }> = [];
const setPayloads: Array<Record<string, unknown>> = [];

vi.mock("@/shared/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/db/schemas/index")>();
  return {
    // Schemas reales: intelligence.ts importa de aquí al construir sus tablas.
    ...actual,
    directDb: {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => pendingRows,
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (payload: Record<string, unknown>) => {
          setPayloads.push(payload);
          return {
            where: () => ({
              returning: async () => updateReturn,
            }),
          };
        },
      })),
    },
  };
});

vi.mock("./ai-router", () => ({
  callAIWithFallback: vi.fn(),
  getNoApiKeyResponse: (_t: string, locale: string) => `no-key-${locale}`,
}));

import { runFindingTriage, runFindingTriageSweep, TriageBatchSchema } from "./finding-triage";
import { callAIWithFallback } from "./ai-router";

const mockAI = vi.mocked(callAIWithFallback);

const F1 = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "SQL Injection en formulario de login",
  description: "El parámetro email refleja comillas sin escapar y responde con SLEEP(5).",
  severity: "critical",
  affectedAsset: "tienda.example.com/login",
};

const F2 = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Cabeceras de seguridad ausentes",
  description: "Faltan CSP, X-Frame-Options y HSTS en todas las respuestas.",
  severity: "low",
  affectedAsset: null,
};

function aiOk(triage: unknown) {
  return {
    success: true as const,
    content: JSON.stringify(triage),
    modelUsed: "nvidia/nemotron-3-ultra-550b-a55b:free",
    latencyMs: 500,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingRows = [];
  updateReturn = [];
  setPayloads.length = 0;
});

describe("runFindingTriage", () => {
  it("sin pendientes no llama a la IA", async () => {
    const r = await runFindingTriage("p1");
    expect(r.processed).toBe(0);
    expect(r.updated).toBe(0);
    expect(mockAI).not.toHaveBeenCalled();
  });

  it("triage válido actualiza findings e ignora ids inventados por el modelo", async () => {
    pendingRows = [F1, F2];
    // Solo el finding con id conocido genera un update (el mock devuelve las
    // filas que configured para ESE update).
    updateReturn = [{ id: F1.id }];
    mockAI.mockResolvedValueOnce(
      aiOk({
        triage: [
          {
            findingId: F1.id,
            severity: "critical",
            cvssScore: 9.1,
            mitreId: "T1190",
            cweId: "CWE-89",
            businessImpact: "Un atacante podría extraer toda la base de datos de clientes.",
            remediation: ["Usar consultas parametrizadas", "Validar entrada con allowlist"],
          },
          {
            findingId: "99999999-9999-4999-8999-999999999999", // id inventado
            severity: "low",
            cvssScore: 3,
            mitreId: null,
            cweId: null,
            businessImpact: "Impacto menor.",
            remediation: ["Revisar"],
          },
        ],
      })
    );

    const r = await runFindingTriage("p1", { userId: "u1" });
    expect(r.success !== false).toBe(true);
    expect(r.modelUsed).toContain("nemotron");
    // Solo el id conocido pasa el filtro byId → 1 update
    expect(setPayloads).toHaveLength(1);
    const payload = setPayloads[0]! as { aiTriage: Record<string, unknown> };
    expect(payload.aiTriage).toMatchObject({ severity: "critical", mitreId: "T1190", cweId: "CWE-89" });
    expect(payload.aiTriage.promptVersion).toBe(2); // v2: json_object (matriz en vivo)
    expect(r.updated).toBe(1);
  });

  it("IA sin key: degradación graciosa sin lanzar y sin contar fallos de modelo", async () => {
    pendingRows = [F1];
    mockAI.mockResolvedValueOnce({
      success: false,
      content: "",
      modelUsed: "none",
      latencyMs: 5,
      error: "OPENROUTER_API_KEY is not configured.",
    });

    const r = await runFindingTriage("p1");
    expect(r.updated).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.error).toBeDefined();
  });

  it("salida no-JSON del modelo: reporta fallo sin lanzar", async () => {
    pendingRows = [F1, F2];
    mockAI.mockResolvedValueOnce({
      success: true,
      content: "lo siento, no puedo generar JSON",
      modelUsed: "m",
      latencyMs: 100,
    });

    const r = await runFindingTriage("p1");
    expect(r.updated).toBe(0);
    expect(r.failed).toBe(2);
    expect(r.error).toContain("salida inválida");
  });

  it("salida JSON que viola el schema Zod: reporta fallo con detalle", async () => {
    pendingRows = [F1];
    mockAI.mockResolvedValueOnce(
      aiOk({ triage: [{ findingId: F1.id, severity: "catastrofica", cvssScore: 99 }] })
    );

    const r = await runFindingTriage("p1");
    expect(r.updated).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.error).toContain("salida inválida");
  });

  it("excepción de la cadena IA: capturada y reportada", async () => {
    pendingRows = [F1];
    mockAI.mockRejectedValueOnce(new Error("OpenRouter 429"));

    const r = await runFindingTriage("p1");
    expect(r.updated).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.error).toContain("429");
  });
});

describe("runFindingTriageSweep", () => {
  it("para tras un ciclo sin progreso (no martillea)", async () => {
    pendingRows = [F1];
    updateReturn = []; // la BD no confirma ningún update
    mockAI.mockResolvedValue(aiOk({ triage: [] })); // lote vacío → Zod falla

    const r = await runFindingTriageSweep("p1", { maxCalls: 4 });
    expect(r.calls).toBe(1); // sin progreso → no repite
    expect(r.updated).toBe(0);
  });

  it("agota pendientes en varios ciclos cuando hay progreso", async () => {
    updateReturn = [{ id: F1.id }];
    // Ciclo 1: 2 pendientes → 2 updates; ciclo 2: sin pendientes → stop.
    pendingRows = [F1, F2];
    mockAI.mockImplementationOnce(async () =>
      aiOk({
        triage: [
          {
            findingId: F1.id,
            severity: "critical",
            cvssScore: 9.1,
            mitreId: "T1190",
            cweId: "CWE-89",
            businessImpact: "Impacto alto en datos de clientes.",
            remediation: ["Parametrizar consultas"],
          },
          {
            findingId: F2.id,
            severity: "low",
            cvssScore: 3.1,
            mitreId: null,
            cweId: "CWE-693",
            businessImpact: "Exposición menor a ataques conocidos.",
            remediation: ["Añadir cabeceras de seguridad"],
          },
        ],
      })
    );

    const r = await runFindingTriageSweep("p1", { maxCalls: 3 });
    expect(r.calls).toBe(2); // 1 con progreso + 1 que ya no encuentra pendientes
    expect(r.updated).toBe(2);
  });
});

describe("TriageBatchSchema", () => {
  it("rechaza mitreId con formato inválido", () => {
    const r = TriageBatchSchema.safeParse({
      triage: [
        {
          findingId: F1.id,
          severity: "high",
          cvssScore: 7.5,
          mitreId: "ATTACK-T1190",
          cweId: null,
          businessImpact: "Texto suficiente para pasar la validación.",
          remediation: ["Paso válido"],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("acepta el formato correcto con nulls", () => {
    const r = TriageBatchSchema.safeParse({
      triage: [
        {
          findingId: F1.id,
          severity: "info",
          cvssScore: 0,
          mitreId: "T1190.001",
          cweId: null,
          businessImpact: "Sin impacto directo.",
          remediation: ["Monitorear"],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
