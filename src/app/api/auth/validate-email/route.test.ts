/* ═══════════════════════════════════════════════════════════════════════════
   Auth: Validate email (pre-magic-link) — Tests de endpoint (TD-03 lote 3)

   Rate limit por IP simulado; validador de email real. Verifica:
   - Cuerpo no JSON → 400; schema inválido → 400
   - Email válido → 200 con headers X-RateLimit-*
   - Rate limit agotado → 429 con retryAfter y Retry-After
   - Cuenta allowlist → sin consultar el rate limit (caso borde)
   - Patrón de spam → 400 con motivo del validador
   - Fallo del servicio de rate limit → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRateLimit = vi.fn();
const mockAllowlist = vi.fn();

vi.mock("@/shared/lib/ratelimit", () => ({
  checkEmailRateLimit: (...args: unknown[]) => mockRateLimit(...args),
  extractClientIp: () => "203.0.113.7",
  isEmailAllowlisted: (...args: unknown[]) => mockAllowlist(...args),
  buildRateLimitHeaders: (result: {
    limit: number;
    remaining: number;
    reset: number;
  }) => {
    const headers = new Headers();
    headers.set("X-RateLimit-Limit", String(result.limit));
    headers.set("X-RateLimit-Remaining", String(result.remaining));
    headers.set("X-RateLimit-Reset", String(result.reset));
    return headers;
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/validate-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const okRate = {
  success: true,
  limit: 40,
  remaining: 39,
  reset: 60,
  retryAfter: 0,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Auth: Validate email — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(okRate);
    mockAllowlist.mockReturnValue(false);
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("cuerpo no JSON → 400", async () => {
    const res = await POST(createRequest("no-es-json") as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("El cuerpo de la solicitud no es JSON válido.");
  });

  it("email fuera de schema → 400", async () => {
    const res = await POST(createRequest({ email: "not-an-email" }) as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("El correo electrónico no es válido.");
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("email válido → 200 con headers de rate limit", async () => {
    const res = await POST(createRequest({ email: "user@gmail.com" }) as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("40");
    expect(mockRateLimit).toHaveBeenCalledWith("203.0.113.7");
  });

  it("rate limit agotado → 429 con retryAfter", async () => {
    mockRateLimit.mockResolvedValue({
      success: false,
      limit: 40,
      remaining: 0,
      reset: 60,
      retryAfter: 30,
    });

    const res = await POST(createRequest({ email: "user@gmail.com" }) as never);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.retryAfter).toBe(30);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("cuenta allowlist → sin consultar el rate limit", async () => {
    mockAllowlist.mockReturnValue(true);

    const res = await POST(createRequest({ email: "user@gmail.com" }) as never);
    expect(res.status).toBe(200);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("patrón de spam → 400 con motivo del validador", async () => {
    const res = await POST(createRequest({ email: "test@miempresa.dev" }) as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toContain("spam");
    expect(mockRateLimit).toHaveBeenCalled();
  });

  it("fallo del servicio de rate limit → 500", async () => {
    mockRateLimit.mockRejectedValue(new Error("redis down"));

    const res = await POST(createRequest({ email: "user@gmail.com" }) as never);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("Error interno al validar el correo.");
  });
});
