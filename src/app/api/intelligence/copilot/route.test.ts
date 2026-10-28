/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Copilot (plan de remediación) — Tests de endpoint (TD-03 lote 2)

   withRateLimit en passthrough (inyecta userId). Verifica:
   - Cuota IA corta antes de trabajar; sin investigationId → 400;
     investigación inexistente → 404
   - Sin hallazgos → mensaje honesto de ausencia + CTA, sin IA ni plan
     inventado; IA ok → plan real + hasFindings; fallo IA → success false
   - Excepción interna → 500 success false, sin plan de fallback
   - TD-13: total de hallazgos con COUNT(group-by) y prompt acotado a 100
     filas (estado vacío decidido desde los counts, no desde el fetch)
   ═══════════════════════════════════════════════════════════════════════════ */

// C5: `stream:true` abre SSE chunk/done; `done` no lleva el plan. Un fallo
// antes del primer chunk conserva el JSON legado; uno posterior emite error.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockQuota = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCallAI = vi.fn();
const mockCallAIStream = vi.fn();
const mockSeverityCounts = vi.fn();

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
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(async () => mockSeverityCounts()),
          })),
        })),
      })),
    }),
}));

vi.mock("@/server/ai/ai-router", () => ({
  callAIWithFallback: (...args: unknown[]) => mockCallAI(...args),
  callAIWithFallbackStream: (...args: unknown[]) => mockCallAIStream(...args),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/i18n/request", () => ({
  getLocale: async () => "es",
  getMessages: async () => ({
    intelligence: {
      copilotNoFindings:
        "La investigación aún no tiene hallazgos. Inicia un escaneo para generar datos reales.",
      copilotRunScan: "Escanear infraestructura",
    },
  }),
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
    mockSeverityCounts.mockResolvedValue([{ severity: "high", n: 1 }]);
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

  it("sin hallazgos → mensaje honesto de ausencia + CTA, sin llamar a la IA", async () => {
    mockSeverityCounts.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      hasFindings: false,
      remediationPlan:
        "La investigación aún no tiene hallazgos. Inicia un escaneo para generar datos reales.",
      action: {
        href: "/intelligence#intelligence-scan",
        label: "Escanear infraestructura",
      },
    });
    expect(body.remediationPlan).not.toContain("Felicidades");
    expect(body.remediationPlan).not.toContain("No se encontraron vulnerabilidades");
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("IA ok → plan con modelUsed y fromCache", async () => {
    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      hasFindings: true,
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

  it("fallo IA → 503 success false sin plan de fallback", async () => {
    mockCallAI.mockResolvedValue({ success: false, error: "all models down" });

    const res = await POST(createRequest({ investigationId: "inv-1" }) as never);
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.hasFindings).toBe(true);
    expect(body.remediationPlan).toBeUndefined();
    expect(body.error).toBe("all models down");
  });

  it("excepción interna → 500 success false sin plan de fallback", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/intelligence/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "no-es-json",
      }) as never,
    );
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.remediationPlan).toBeUndefined();
    expect(body.error).toBeTruthy();
  });
});

function parseSse(text: string): Array<Record<string, unknown>> {
  return text
    .trim()
    .split("\n\n")
    .map((line) => JSON.parse(line.replace(/^data: /, "")) as Record<string, unknown>);
}

describe("Intelligence: Copilot - streaming (stream: true)", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuota.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(investigation);
    mockFindMany.mockResolvedValue([finding]);
    mockSeverityCounts.mockResolvedValue([{ severity: "high", n: 1 }]);
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("chunks + done → 200 SSE; done no contiene el plan", async () => {
    mockCallAIStream.mockImplementation(
      async (
        _options: unknown,
        onChunk: (text: string) => void,
      ): Promise<unknown> => {
        onChunk("## Plan\n");
        onChunk("Paso 1");
        return {
          success: true,
          content: "## Plan\nPaso 1",
          modelUsed: "m1",
          latencyMs: 12,
          fromCache: false,
        };
      },
    );

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    const events = parseSse(await res.text());
    expect(events).toEqual([
      { type: "chunk", text: "## Plan\n" },
      { type: "chunk", text: "Paso 1" },
      { type: "done", modelUsed: "m1", fromCache: false },
    ]);
    expect(events.at(-1)).not.toHaveProperty("remediationPlan");
    expect(events.at(-1)).not.toHaveProperty("content");

    const options = mockCallAIStream.mock.calls[0]?.[0] as {
      taskType: string;
      userId: string;
      cacheScope: string;
      temperature: number;
      disableSemanticCache?: boolean;
    };
    expect(options.taskType).toBe("copilot-remediation");
    expect(options.userId).toBe("u-1");
    expect(options.cacheScope).toBe("user:u-1");
    expect(options.temperature).toBe(0.3);
    expect(options.disableSemanticCache).toBeUndefined();
  });

  it("cero hallazgos con stream:true → JSON de ausencia y sin IA", async () => {
    mockSeverityCounts.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.hasFindings).toBe(false);
    expect(body.remediationPlan).toContain("aún no tiene hallazgos");
    expect(mockCallAIStream).not.toHaveBeenCalled();
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("fallo antes del primer chunk → 503 JSON legado (no SSE roto)", async () => {
    mockCallAIStream.mockResolvedValue({
      success: false,
      content: "",
      modelUsed: "none",
      latencyMs: 5,
      error: "all models down",
    });

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      hasFindings: true,
      error: "all models down",
    });
  });

  it("excepción del router antes del primer chunk → 503 JSON", async () => {
    mockCallAIStream.mockRejectedValue(new Error("db down"));

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.hasFindings).toBe(true);
    expect(body.error).toBe("db down");
  });

  it("fallo tras el primer chunk → SSE con error, sin done", async () => {
    mockCallAIStream.mockImplementation(
      async (
        _options: unknown,
        onChunk: (text: string) => void,
      ): Promise<unknown> => {
        onChunk("parcial ");
        return {
          success: false,
          content: "parcial ",
          modelUsed: "m1",
          latencyMs: 20,
          error: "Stream interrumpido por m1: conexión muerta",
        };
      },
    );

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('{"type":"chunk","text":"parcial "}');
    expect(text).toContain('"type":"error"');
    expect(text).toContain("Stream interrumpido");
    expect(text).not.toContain('"type":"done"');
  });

  it("cuota agotada con stream:true → 429 antes de abrir el stream", async () => {
    mockQuota.mockResolvedValue(
      Response.json({ success: false, error: "Cuota diaria agotada" }, { status: 429 }),
    );

    const res = await POST(
      createRequest({ investigationId: "inv-1", stream: true }) as never,
    );

    expect(res.status).toBe(429);
    expect(mockCallAIStream).not.toHaveBeenCalled();
  });

  it("investigación fuera de RLS con stream:true → 404 sin IA", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await POST(
      createRequest({ investigationId: "inv-ajena", stream: true }) as never,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("acceso denegado");
    expect(mockCallAIStream).not.toHaveBeenCalled();
  });
});
