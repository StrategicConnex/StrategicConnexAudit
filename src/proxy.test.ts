/* ═══════════════════════════════════════════════════════════════════════════
   Proxy (Middleware) — Tests de Seguridad y Sesión
   
   Verifica que el proxy global de Next.js 16:
   - Aplica headers de seguridad (CSP, HSTS, X-Frame-Options, etc.)
   - Genera nonce único por request
   - Delega a updateSession de Supabase
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUpdateSession = vi.fn();

vi.mock("@/shared/lib/supabase/middleware", () => ({
  updateSession: (...args: any[]) => mockUpdateSession(...args),
}));

// ─── Helper ──────────────────────────────────────────────────────────────────

function createMockRequest(path: string = "/login"): NextRequest {
  return new NextRequest(new Request(`http://localhost:3000${path}`, {
    headers: { "user-agent": "test-agent" },
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Proxy — Security Headers", () => {
  let proxyFn: typeof import("./proxy").default;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Simular respuesta de updateSession con headers default
    const mockResponse = new Response(null, {
      headers: { "content-type": "text/html" },
    });
    mockUpdateSession.mockResolvedValue(mockResponse);

    // Recargar módulo fresco
    proxyFn = (await import("./proxy")).default;
  });

  it("CSP: default-src 'self'", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
  });

  it("CSP: script-src con self + unsafe-inline", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("CSP: style-src con self + unsafe-inline", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("CSP: frame-ancestors 'none' (clickjacking)", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("CSP: base-uri 'self'", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("base-uri 'self'");
  });

  it("CSP: form-action 'self'", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("form-action 'self'");
  });

  it("CSP: report-uri /api/security/csp-report", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("/api/security/csp-report");
  });

  it("CSP: connect-src incluye Supabase", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("https://*.supabase.co");
  });

  it("HSTS: max-age de 1 año + subdominios + preload", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const hsts = response.headers.get("strict-transport-security");
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("X-Frame-Options: DENY", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("X-Content-Type-Options: nosniff", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy: geolocation, microphone, camera restringidos", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const pp = response.headers.get("permissions-policy");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("camera=()");
    expect(pp).toContain("payment=()");
  });

  it("X-XSS-Protection: 1; mode=block", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    expect(response.headers.get("x-xss-protection")).toBe("1; mode=block");
  });

  it("agrega x-csp-nonce al request", async () => {
    await proxyFn(createMockRequest("/login"));

    const passedRequest = mockUpdateSession.mock.calls[0][0];
    const nonce = passedRequest.headers.get("x-csp-nonce");
    expect(nonce).toBeDefined();
    expect(nonce.length).toBeGreaterThan(0);
    expect(nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("genera nonce distinto en cada request", async () => {
    await proxyFn(createMockRequest("/login"));
    await proxyFn(createMockRequest("/login"));

    const req1 = mockUpdateSession.mock.calls[0][0];
    const req2 = mockUpdateSession.mock.calls[1][0];
    const nonce1 = req1.headers.get("x-csp-nonce");
    const nonce2 = req2.headers.get("x-csp-nonce");
    expect(nonce1).not.toBe(nonce2);
  });

  it("delega a updateSession de Supabase", async () => {
    await proxyFn(createMockRequest("/login"));

    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    const passedRequest = mockUpdateSession.mock.calls[0][0];
    expect(passedRequest.headers.get("user-agent")).toBe("test-agent");
  });

  it("retorna el response de updateSession con headers adicionales", async () => {
    const response = await proxyFn(createMockRequest("/"));

    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.headers.get("content-security-policy")).toBeDefined();
  });
});
