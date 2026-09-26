/* ═══════════════════════════════════════════════════════════════════════════
   Security: SIEM Test Alert — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Auth dual: CRON_SECRET vía isCronSecretMatched O requireAdmin
   - Cron → 200 sin pasar por requireAdmin (no toca Supabase)
   - Usuario admin → 200; sin admin → 403/401 del gate
   - sendTestAlert lanza → 500 con error interno
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockIsCronSecretMatched = vi.fn();
const mockRequireAdmin = vi.fn();
const mockSendTestAlert = vi.fn();

vi.mock("@/server/auth/cron", () => ({
  isCronSecretMatched: (...args: unknown[]) => mockIsCronSecretMatched(...args),
}));

vi.mock("@/server/auth/admin", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/server/security/siem-exporter", () => ({
  sendTestAlert: (...args: unknown[]) => mockSendTestAlert(...args),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const testResult = {
  targetsAttempted: 2,
  success: true,
  details: [
    { name: "Slack", status: "ok", message: "200 OK" },
    { name: "Splunk", status: "error", message: "401: Invalid token" },
  ],
};

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new NextRequest(
    new Request("http://localhost:3000/api/security/siem/test", { method: "GET", headers }),
  );
}

function gateDenied(status: 401 | 403 = 403) {
  return {
    ok: false as const,
    response: NextResponse.json(
      { success: false, error: status === 401 ? "No autorizado" : "Prohibido: se requiere rol admin" },
      { status },
    ),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Security: SIEM Test Alert — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCronSecretMatched.mockReturnValue(false);
    mockSendTestAlert.mockResolvedValue(testResult);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("CRON_SECRET válido → 200 sin pasar por requireAdmin", async () => {
    mockIsCronSecretMatched.mockReturnValue(true);

    const res = await GET(createRequest("Bearer supersecret"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.targetsAttempted).toBe(2);
    expect(body.details).toHaveLength(2);
    expect(body.timestamp).toBeDefined();
    expect(mockSendTestAlert).toHaveBeenCalledTimes(1);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it("sin cron + usuario admin → 200", async () => {
    mockRequireAdmin.mockResolvedValue({ ok: true, userId: "u-admin" });

    const res = await GET(createRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1);
  });

  it("sin cron + rol denegado → 403 y NO envía la alerta", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(403));

    const res = await GET(createRequest());
    expect(res.status).toBe(403);
    expect(mockSendTestAlert).not.toHaveBeenCalled();
  });

  it("sin cron + sesión no autenticada → 401", async () => {
    mockRequireAdmin.mockResolvedValue(gateDenied(401));

    const res = await GET(createRequest());
    expect(res.status).toBe(401);
    expect(mockSendTestAlert).not.toHaveBeenCalled();
  });

  it("sendTestAlert lanza → 500 con error interno", async () => {
    mockIsCronSecretMatched.mockReturnValue(true);
    mockSendTestAlert.mockRejectedValue(new Error("webhook down"));

    const res = await GET(createRequest("Bearer supersecret"));
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
  });
});
