/* ═══════════════════════════════════════════════════════════════════════════
   Auth: Callback (code exchange) — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Sin code → redirect a /login?error=auth-code-error
   - Exchange exitoso → redirect al next saneado
   - Open redirect (//evil.com) → saneado a / + logSecurityEvent
     "open_redirect_attempt"
   - Rate limit excedido → respuesta 429 + log "rate_limit_hit"
   - Cuenta allowlist → saltamos el rate limit
   - Exchange con error → redirect al login con error
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockExchange = vi.fn();
const mockCheckRate = vi.fn();
const mockAllowlist = vi.fn();
const mockLog = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { exchangeCodeForSession: mockExchange },
  })),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  extractClientIp: () => "203.0.113.7",
  checkCallbackRateLimit: (...args: unknown[]) => mockCheckRate(...args),
  rateLimitResponse: (result: { retryAfter?: number }) =>
    new Response(null, { status: 429, headers: { "x-retry-after": String(result.retryAfter ?? 60) } }),
  isEmailAllowlisted: (email: string | null | undefined) => mockAllowlist(email),
}));

vi.mock("@/shared/lib/audit-log", () => ({
  logSecurityEvent: (...args: unknown[]) => mockLog(...args),
  eventFromRequest: () => ({ ip: "203.0.113.7", path: "/auth/callback", method: "GET" }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORIGIN = "http://localhost:3000";

function createRequest(query = ""): Request {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

const rateOk = { success: true, limit: 10, remaining: 9, reset: 60, retryAfter: 0 };
const exchangeOk = {
  data: { user: { id: "u-1", email: "user@example.com" } },
  error: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Auth: Callback — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExchange.mockResolvedValue(exchangeOk);
    mockCheckRate.mockResolvedValue(rateOk);
    mockAllowlist.mockReturnValue(false);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin code → redirect a login con error", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth-code-error`);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("exchange exitoso → redirect al next seguro y rate limit evaluado por IP", async () => {
    const res = await GET(createRequest("?code=abc123&next=/dashboard"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);

    expect(mockExchange).toHaveBeenCalledWith("abc123");
    expect(mockCheckRate).toHaveBeenCalledWith("203.0.113.7");
    expect(mockAllowlist).toHaveBeenCalledWith("user@example.com");
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("next malicioso (protocol-relative) → saneado a / y auditado", async () => {
    const res = await GET(createRequest("?code=abc123&next=//evil.com"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);

    expect(mockLog).toHaveBeenCalledWith(
      "open_redirect_attempt",
      expect.objectContaining({
        metadata: expect.objectContaining({
          attemptedNext: "//evil.com",
          blockedReason: "protocol-relative URL",
        }),
      }),
    );
  });

  it("next externo (https://evil.com) → saneado a / y auditado", async () => {
    const res = await GET(createRequest("?code=abc123&next=https://evil.com"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(mockLog).toHaveBeenCalledWith(
      "open_redirect_attempt",
      expect.objectContaining({ metadata: expect.objectContaining({ attemptedNext: "https://evil.com" }) }),
    );
  });

  it("rate limit excedido → 429 y log rate_limit_hit (sin redirect)", async () => {
    mockCheckRate.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 60,
      retryAfter: 30,
    });

    const res = await GET(createRequest("?code=abc123"));
    expect(res.status).toBe(429);
    expect(mockLog).toHaveBeenCalledWith("rate_limit_hit", expect.anything());
  });

  it("cuenta allowlist → se salta el rate limit", async () => {
    mockAllowlist.mockReturnValue(true);

    const res = await GET(createRequest("?code=abc123&next=/projects"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/projects`);
    expect(mockCheckRate).not.toHaveBeenCalled();
  });

  it("exchange con error → redirect al login con error", async () => {
    mockExchange.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });

    const res = await GET(createRequest("?code=expired"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth-code-error`);
  });

  it("exchange sin user y sin error → redirect al login con error", async () => {
    mockExchange.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(createRequest("?code=abc123"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?error=auth-code-error`);
  });
});
