/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Brief (Incident Brief) — Tests de endpoint (TD-03 lote 2)

   withRateLimit en passthrough (inyecta userId); withErrorHandler REAL
   (ValidationError→400, NotFoundError→404). Verifica:
   - Cuota IA (assertAiQuota) corta antes de cualquier trabajo
   - Sin investigationId → 400; investigación inexistente → 404
   - Sin hallazgos high/critical → brief estático sin IA
   - IA ok → brief + modelUsed; sin API key → brief estructurado de fallback;
     fallo IA genérico → mensaje de reintento
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
  getNoApiKeyResponse: (task: string) => `Sin API key configurada (${task})`,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/intelligence/brief", {
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

const criticalFinding = {
  severity: "critical",
  title: "TLS obsoleto",
  description: "TLS 1.0 habilitado",
  recommendation: "Deshabilitar TLS 1.0",
  affectedAsset: "example.com",
  investigationId: "inv-1",
};

const mediumFinding = {
  severity: "medium",
  title: "Header ausente",
  description: "Falta X-Frame-Options",
  recommendation: "Añadir header",
  affectedAsset: null,
  investigationId: "inv-1",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Brief — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuota.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(investigation);
    mockFindMany.mockResolvedValue([criticalFinding, mediumFinding]);
    mockCallAI.mockResolvedValue({
      success: true,
      content: "# Incident Brief generado",
      modelUsed: "m1",
      fromCache: false,
    });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("cuota IA agotada → devuelve la respuesta de cuota sin llamar a la IA", async () => {
    mockQuota.mockResolvedValue(
      Response.json({ success: false, error: "Cuota diaria agotada" }, { status: 429 }),
    );

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(429);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("sin investigationId → 400 ValidationError", async () => {
    const res = await POST(createRequest({}) as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Falta ID de investigación");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("investigación inexistente → 404 NotFoundError", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest({ investigationId: "nope" }) as never);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("sin hallazgos high/critical → brief estático sin llamar a la IA", async () => {
    mockFindMany.mockResolvedValue([mediumFinding]);

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.brief).toContain("No se detectaron hallazgos");
    expect(body.brief).toContain("example.com");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("IA ok → brief generado con modelUsed", async () => {
    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      brief: "# Incident Brief generado",
      modelUsed: "m1",
      fromCache: false,
    });
    expect(mockCallAI).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "incident-brief", userId: "u-1" }),
    );
  });

  it("IA sin API key → brief estructurado de fallback (success true)", async () => {
    mockCallAI.mockResolvedValue({
      success: false,
      error: "OPENROUTER_API_KEY is not configured",
    });

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.brief).toContain("Motor de IA No Configurado");
    expect(body.brief).toContain("TLS obsoleto");
  });

  it("fallo IA genérico → mensaje de reintento en el brief", async () => {
    mockCallAI.mockResolvedValue({ success: false, error: "timeout" });

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.brief).toBe(
      "No fue posible generar el Incident Brief. Intenta nuevamente.",
    );
  });
});
