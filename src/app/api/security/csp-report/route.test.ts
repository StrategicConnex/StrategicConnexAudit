/* ═══════════════════════════════════════════════════════════════════════════
   Security: CSP Report — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Reporte CSP válido → 204 + logSecurityEvent con metadatos extraídos
   - Cuerpo > 16KB → 204 descartado SIN persistir (anti DB-bloat)
   - JSON malformado → 204 fail-safe con metadatos por defecto
   - IP preferente: x-forwarded-for > x-real-ip > unknown
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockLogSecurityEvent = vi.fn();

vi.mock("@/shared/lib/audit-log", () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (_opts: unknown, handler: unknown) => handler,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(
  body: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/security/csp-report", {
      method: "POST",
      headers,
      body,
    }),
  );
}

const validReport = JSON.stringify({
  "csp-report": {
    "blocked-uri": "https://evil.com/xss.js",
    "document-uri": "https://app.example.com/dashboard",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'; script-src 'self'",
    "source-file": "https://app.example.com/static/js/main.js",
    "line-number": 42,
    "column-number": 7,
  },
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Security: CSP Report — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("reporte CSP válido → 204 y log estructurado con metadatos", async () => {
    const res = await POST(
      createRequest(validReport, { "content-length": "300", "x-forwarded-for": "198.51.100.7" }),
    );
    expect(res.status).toBe(204);

    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "csp_violation",
      expect.objectContaining({
        ip: "198.51.100.7",
        path: "/api/security/csp-report",
        method: "POST",
        metadata: expect.objectContaining({
          blockedUri: "https://evil.com/xss.js",
          documentUri: "https://app.example.com/dashboard",
          violatedDirective: "script-src-elem",
          sourceFile: "https://app.example.com/static/js/main.js",
          lineNumber: 42,
        }),
      }),
    );
  });

  it("cuerpo > 16KB → 204 y NO persiste el log", async () => {
    const res = await POST(createRequest(validReport, { "content-length": "99999" }));
    expect(res.status).toBe(204);
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  it("JSON malformado → 204 fail-safe y log con valores por defecto", async () => {
    const res = await POST(createRequest("not-json{", { "content-length": "10" }));
    expect(res.status).toBe(204);

    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "csp_violation",
      expect.objectContaining({
        metadata: expect.objectContaining({ blockedUri: "unknown" }),
      }),
    );
  });

  it("sin cabeceras de IP → ip 'unknown'", async () => {
    const res = await POST(createRequest(validReport, { "content-length": "300" }));
    expect(res.status).toBe(204);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "csp_violation",
      expect.objectContaining({ ip: "unknown" }),
    );
  });

  it("cuerpo sin clave csp-report → loggea el objeto raíz", async () => {
    const body = JSON.stringify({ "blocked-uri": "https://cdn.bad.dev/a.js" });
    const res = await POST(createRequest(body, { "content-length": "60" }));
    expect(res.status).toBe(204);
    expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
  });
});
