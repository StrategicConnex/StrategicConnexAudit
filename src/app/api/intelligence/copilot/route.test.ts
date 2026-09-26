/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Copilot (plan de remediación) — Tests de endpoint (TD-03 lote 2)

   withRateLimit en passthrough (inyecta userId). Verifica:
   - Cuota IA corta antes de trabajar; sin investigationId → 400;
     investigación inexistente → 404
   - Sin hallazgos → plan estático sin IA; IA ok → plan + modelUsed;
     fallo IA → success false con plan de fallback + error
   - Excepción interna → catch devuelve plan de fallback (success true)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockQuota = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCallAI = vi.fn();

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (
    _opts: unknown,
    handler: (req: Request, userId: string) => Promise<Response>,
  ) => (req: Request) => handler(req, "u-1"),
}));

vi.mock("@/server/ai/ai-usage", () => ({
  assertAiQuota: (...args: unknown[]) => mockQuota(...args),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: {
        intelligenceInvestigations: {
          findFirst: (...args: unknown[]) => mockFindFirst(...args),
        },
        intelligenceFindings: {
          findMany: (...args: unknown[]) => mockFindMany(...args),
        },
      },
    }),
}));

vi.mock("@/server/ai/ai-router", () => ({
  callAIWithFallback: (...args: unknown[]) => mockCallAI(...args),
  getNoApiKeyResponse: (task: string) => `Plan fallback (${task})`,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/intelligence/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const investigation = {
  id: "inv-1",
  target: "example.com",
  targetType: "domain",
  score: 42,
};

const finding = {
  severity: "high",
  title: "SPF ausente",
  description: "No hay registro SPF",
  recommendation: "Publicar SPF",
  evidence: { record: null },
  investigationId: "inv-1",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Copilot — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuota.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(investigation);
    mockFindMany.mockResolvedValue([finding]);
    mockCallAI.mockResolvedValue({
      success: true,
      content: "# Plan de remediación",
      modelUsed: "m1",
      fromCache: false,
    });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("cuota IA agotada → respuesta de cuota sin tocar la BD", async () => {
    mockQuota.mockResolvedValue(
      Response.json({ success: false, error: "Cuota diaria agotada" }, { status: 429 }),
    );

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(429);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("sin investigationId → 400", async () => {
    const res = await POST(createRequest({}) as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Falta ID de investigación");
  });

  it("investigación inexistente → 404", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest({ investigationId: "nope" }) as never);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Investigación no encontrada o acceso denegado");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("sin hallazgos → plan estático sin llamar a la IA", async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.remediationPlan).toContain("No se encontraron vulnerabilidades");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("IA ok → plan con modelUsed y fromCache", async () => {
    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      remediationPlan: "# Plan de remediación",
      modelUsed: "m1",
      fromCache: false,
    });
    expect(mockCallAI).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "copilot-remediation",
        userId: "u-1",
        temperature: 0.3,
      }),
    );
  });

  it("fallo IA → success false con plan de fallback y error", async () => {
    mockCallAI.mockResolvedValue({ success: false, error: "all models down" });

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.remediationPlan).toBe("Plan fallback (copilot-remediation)");
    expect(body.error).toBe("all models down");
  });

  it("excepción interna → catch devuelve plan de fallback (success true)", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/intelligence/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "no-es-json",
      }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.remediationPlan).toBe("Plan fallback (copilot-remediation)");
    expect(body.error).toBeTruthy();
  });
});
