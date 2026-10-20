/* ═══════════════════════════════════════════════════════════════════════════
   Proxy (Middleware) — Tests de Seguridad y Sesión
   
   Verifica que el proxy global de Next.js 16:
   - Aplica headers de seguridad (CSP, HSTS, X-Frame-Options, etc.)
   - Genera nonce único por request
   - Delega a updateSession de Supabase
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  isDisclaimerPublicPath,
  sanitizeRedirect,
} from "@/shared/lib/disclaimer";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUpdateSession = vi.fn();

vi.mock("@/shared/lib/supabase/middleware", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

// ─── Helper ──────────────────────────────────────────────────────────────────

function createMockRequest(
  path: string = "/login",
  options: { disclaimer?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = { "user-agent": "test-agent" };
  // La mayoría de los tests verifican cabeceras: viajan con la cookie ya
  // aceptada para llegar hasta updateSession. Los tests del gate pasan
  // `{ disclaimer: false }`.
  if (options.disclaimer !== false) {
    headers.cookie = "disclaimer_accepted=true";
  }
  return new NextRequest(new Request(`http://localhost:3000${path}`, {
    headers,
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

  it("CSP: script-src con nonce + strict-dynamic y SIN unsafe-inline", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy") ?? "";
    // Aislar la directiva script-src (style-src sí usa unsafe-inline legítimamente)
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("CSP: script-src usa el MISMO nonce que x-csp-nonce", async () => {
    await proxyFn(createMockRequest("/login"));
    const passedRequest = mockUpdateSession.mock.calls[0]![0];
    const nonce = passedRequest.headers.get("x-csp-nonce");
    const csp = passedRequest.headers.get("content-security-policy");
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("CSP: el header viaja en el REQUEST (Next.js extrae el nonce de ahí)", async () => {
    await proxyFn(createMockRequest("/login"));
    const passedRequest = mockUpdateSession.mock.calls[0]![0];
    expect(passedRequest.headers.get("content-security-policy")).toContain("default-src 'self'");
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

  it("CSP: connect-src solo 'self' + Supabase (sin dominios muertos)", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    // Los LLM/SIEM corren server-side: allowlistarlos aquí solo ampliaría la
    // superficie de exfiltración de datos del navegador.
    expect(csp).not.toContain("apifreellm.com");
    expect(csp).not.toContain("vercel.app");
  });

  it("CSP: connect-src incluye 'self' (de eso depende el túnel /monitoring)", async () => {
    // `next.config.ts` declara `tunnelRoute: "/monitoring"`: el navegador postea
    // los envelopes a esa ruta RELATIVA. Si 'self' desapareciera de connect-src,
    // el POST quedaría bloqueado por la CSP y los errores de cliente se
    // perderían sin ruido (mismo fallo silencioso que un guard que redirige).
    const response = await proxyFn(createMockRequest("/monitoring"));
    const csp = response.headers.get("content-security-policy") ?? "";
    const connectSrc = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("connect-src"));

    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain("'self'");
  });

  it("CSP: object-src 'none'", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("object-src 'none'");
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

    const passedRequest = mockUpdateSession.mock.calls[0]![0];
    const nonce = passedRequest.headers.get("x-csp-nonce");
    expect(nonce).toBeDefined();
    expect(nonce?.length ?? 0).toBeGreaterThan(0);
    expect(nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("genera nonce distinto en cada request", async () => {
    await proxyFn(createMockRequest("/login"));
    await proxyFn(createMockRequest("/login"));

    const req1 = mockUpdateSession.mock.calls[0]![0];
    const req2 = mockUpdateSession.mock.calls[1]![0];
    const nonce1 = req1.headers.get("x-csp-nonce");
    const nonce2 = req2.headers.get("x-csp-nonce");
    expect(nonce1).not.toBe(nonce2);
  });

  it("delega a updateSession de Supabase", async () => {
    await proxyFn(createMockRequest("/login"));

    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    const passedRequest = mockUpdateSession.mock.calls[0]![0];
    expect(passedRequest.headers.get("user-agent")).toBe("test-agent");
  });

  it("retorna el response de updateSession con headers adicionales", async () => {
    const response = await proxyFn(createMockRequest("/"));

    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.headers.get("content-security-policy")).toBeDefined();
  });

  it("fail-closed: si updateSession lanza, responde 500 con headers de seguridad", async () => {
    mockUpdateSession.mockReset();
    mockUpdateSession.mockRejectedValue(new Error("session store caído"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await proxyFn(createMockRequest("/dashboard"));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    const body = (await response.json()) as { error: string; requestId: string };
    expect(body.error).toBe("Internal Server Error");
    expect(body.requestId).toBe(response.headers.get("x-request-id"));
    // Se loguea el fallo con el mensaje (JSON del logger) para diagnóstico
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("fail-closed");
    errorSpy.mockRestore();
  });

  it("fail-closed: el request NO se despacha cuando el proxy falla", async () => {
    mockUpdateSession.mockReset();
    mockUpdateSession.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await proxyFn(createMockRequest("/admin"));

    expect(response.status).toBe(500);
    // updateSession nunca completó → no hubo passthrough del request
    expect(response.headers.get("content-type")).toContain("application/json");
    vi.restoreAllMocks();
  });
});

describe("Proxy — Disclaimer gate (antes de la auth)", () => {
  let proxyFn: typeof import("./proxy").default;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateSession.mockResolvedValue(
      new Response(null, { headers: { "content-type": "text/html" } })
    );
    proxyFn = (await import("./proxy")).default;
  });

  function locationOf(response: Response): URL {
    return new URL(response.headers.get("location") ?? "http://invalid/");
  }

  it("sin cookie: / redirige a /disclaimer?redirect=%2F", async () => {
    const response = await proxyFn(createMockRequest("/", { disclaimer: false }));
    expect(response.status).toBe(307);
    expect(locationOf(response).pathname).toBe("/disclaimer");
    expect(locationOf(response).searchParams.get("redirect")).toBe("/");
  });

  it("sin cookie: /login redirige al disclaimer y NO consulta la sesión", async () => {
    const response = await proxyFn(createMockRequest("/login", { disclaimer: false }));
    expect(response.status).toBe(307);
    expect(locationOf(response).searchParams.get("redirect")).toBe("/login");
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("sin cookie: conserva el query string en el redirect", async () => {
    const response = await proxyFn(
      createMockRequest("/dashboard?tab=x&y=1", { disclaimer: false })
    );
    expect(locationOf(response).searchParams.get("redirect")).toBe(
      "/dashboard?tab=x&y=1"
    );
  });

  it("el redirect conserva las cabeceras de seguridad del proxy", async () => {
    const response = await proxyFn(createMockRequest("/login", { disclaimer: false }));
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'"
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000"
    );
  });

  it("con cookie: /login renderiza y sí se ejecuta updateSession", async () => {
    const response = await proxyFn(createMockRequest("/login"));
    expect(response.headers.get("location")).toBeNull();
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
  });

  it("una cookie con otro valor no cuenta como aceptación", async () => {
    const request = new NextRequest(
      new Request("http://localhost:3000/login", {
        headers: { cookie: "disclaimer_accepted=no", "user-agent": "test-agent" },
      })
    );
    const response = await proxyFn(request);
    expect(locationOf(response).pathname).toBe("/disclaimer");
  });

  it.each([
    "/disclaimer",
    "/api/auth/callback",
    "/_next/static/chunk.js",
    "/monitoring",
    "/sw.js",
  ])("sin cookie: %s pasa sin redirección", async (routePath) => {
    const response = await proxyFn(createMockRequest(routePath, { disclaimer: false }));
    expect(response.headers.get("location")).toBeNull();
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
  });

  describe("sanitizeRedirect", () => {
    it("acepta rutas internas", () => {
      expect(sanitizeRedirect("/dashboard?tab=1")).toBe("/dashboard?tab=1");
    });

    it.each([
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/dashboard\r\nSet-Cookie: x=1",
      "",
    ])("rechaza %p", (candidate) => {
      expect(sanitizeRedirect(candidate)).toBeNull();
    });
  });

  describe("isDisclaimerPublicPath", () => {
    it("/login NO es pública", () => {
      expect(isDisclaimerPublicPath("/login")).toBe(false);
    });

    it("/api y sus subrutas son públicas", () => {
      expect(isDisclaimerPublicPath("/api")).toBe(true);
      expect(isDisclaimerPublicPath("/api/auth/callback")).toBe(true);
    });

    it("no confunde prefijos parecidos", () => {
      expect(isDisclaimerPublicPath("/apix")).toBe(false);
      expect(isDisclaimerPublicPath("/_nextjs")).toBe(false);
    });

    it("/scripts y /vendor (beacon RUM) son públicos — fix 2026-10-20", () => {
      // Assets del beacon se cargan cross-origin desde los sitios de clientes:
      // SameSite=Lax nunca envía la cookie del disclaimer en ese GET, así que
      // el gate las deriva a HTML (307) y el RUM muere para 100% de visitas.
      expect(isDisclaimerPublicPath("/scripts/vitals.js")).toBe(true);
      expect(isDisclaimerPublicPath("/vendor/web-vitals.iife.js")).toBe(true);
      expect(isDisclaimerPublicPath("/vendor/leaflet/x.js")).toBe(true);
      // Prefijos parecidos siguen cerrados:
      expect(isDisclaimerPublicPath("/scriptsx")).toBe(false);
      expect(isDisclaimerPublicPath("/vendorx/y.js")).toBe(false);
    });
  });
});
