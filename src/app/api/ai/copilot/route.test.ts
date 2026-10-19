/* ═══════════════════════════════════════════════════════════════════════════
   AI: Copilot (chat general) — Tests de endpoint (TD-03 lote 3)

   withRateLimit en passthrough (inyecta userId). Verifica:
   - Cuota IA corta antes de parsear el cuerpo → 429 sin tocar la IA
   - messages no array → 400
   - IA ok → 200 con message, modelUsed y fromCache
   - fallo IA → 200 con mensaje fallback + error
   - excepción interna (body no JSON) → catch devuelve fallback (success true)
   - mode "analyst" → system prompt de analista
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockQuota = vi.fn();
const mockCallAI = vi.fn();

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (_cfg: unknown, handler: unknown) => handler,
}));

vi.mock("@/server/ai/ai-usage", () => ({
  assertAiQuota: (...args: unknown[]) => mockQuota(...args),
}));

vi.mock("@/server/ai/ai-router", () => ({
  callAIWithFallback: (...args: unknown[]) => mockCallAI(...args),
  getNoApiKeyResponse: (task: string) => `Fallback (${task})`,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/ai/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("AI: Copilot — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuota.mockResolvedValue(null);
    mockCallAI.mockResolvedValue({
      success: true,
      content: "Hello!",
      modelUsed: "m1",
      fromCache: false,
    });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("cuota IA agotada → 429 sin llamar a la IA", async () => {
    mockQuota.mockResolvedValue(
      Response.json({ success: false, error: "Cuota diaria agotada" }, { status: 429 }),
    );

    const res = await POST(
      createRequest({ messages: [{ role: "user", content: "hola" }] }) as never,
      "u-1",
    );
    expect(res.status).toBe(429);
    expect(mockCallAI).not.toHaveBeenCalled();
  });

  it("messages no es un array → 400", async () => {
    const res = await POST(createRequest({ messages: "hola" }) as never, "u-1");
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Mensajes inválidos");
  });

  it("IA ok → 200 con message, modelUsed y fromCache", async () => {
    const res = await POST(
      createRequest({ messages: [{ role: "user", content: "hola" }] }) as never,
      "u-1",
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: "Hello!",
      modelUsed: "m1",
      fromCache: false,
    });
    expect(mockCallAI).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: "general-chat",
        userId: "u-1",
        temperature: 0.4,
      }),
    );
  });

  it("fallo IA no-config → 200 con onboarding; fallo no-config → mensaje de servicio (2026-10-19)", async () => {
    // El error "not configured" (proveniente del router cuando NO hay niguna
    // clave) mapea al onboarding clásico.
    mockCallAI.mockResolvedValue({
      success: false,
      error: "No hay ninguna clave de IA configurada. Configura OPENROUTER_API_KEY",
    });

    const res = await POST(
      createRequest({ messages: [{ role: "user", content: "hola" }] }) as never,
      "u-1",
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Fallback (general-chat)"); // onboarding
    expect(body.error).toContain("ninguna clave");

    // Un fallo del pool NO es un problema de configuración: el onboarding
    // inducía a re-configurar claves que ya estaban bien (Modo Analista).
    mockCallAI.mockResolvedValue({ success: false, error: "all models down" });
    const res2 = await POST(
      createRequest({ messages: [{ role: "user", content: "hola" }] }) as never,
      "u-1",
    );
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.message).toContain("Motor de IA temporalmente no disponible");
    expect(body2.error).toBe("all models down");
  });

  it("excepción interna → catch devuelve mensaje de servicio con success true", async () => {
    const res = await POST(createRequest("no-es-json") as never, "u-1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Un throw de infra (auth/quota/DB) ya NO se disfraza de "IA sin
    // configurar": mensaje de servicio transitorio + detalle técnico.
    expect(body.message).toContain("Servicio temporalmente no disponible");
    expect(body.error).toBeTruthy();
  });

  it("mode analyst → system prompt de analista", async () => {
    await POST(
      createRequest({
        messages: [{ role: "user", content: "hola" }],
        mode: "analyst",
      }) as never,
      "u-1",
    );

    const sent = mockCallAI.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].content).toContain("Analista de Ciberseguridad");
  });
});
