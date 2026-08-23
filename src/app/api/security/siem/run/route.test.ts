/* ═══════════════════════════════════════════════════════════════════════════
   Security: SIEM Run — Tests de endpoint (P0)

   Verifica:
   - Autenticación dual: CRON_SECRET (Bearer) o usuario ADMIN de plataforma
   - Sin credenciales → 401; usuario NO admin → 403
   - Ejecución exitosa delega a runSiemExport y devuelve el resultado
   - Error de exportación → 500 con error interno
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunSiemExport = vi.fn();
const mockGetUser = vi.fn();
const mockPlatformRole: { current: string | null } = { current: null };

vi.mock("@/server/security/siem-exporter", () => ({
  runSiemExport: mockRunSiemExport,
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db", () => {
  const resolveRole = () =>
    Promise.resolve(
      mockPlatformRole.current === null ? [] : [{ role: mockPlatformRole.current }],
    );
  const chain = {
    where: () => ({ limit: () => resolveRole(), then: undefined }),
    from: () => chain,
    select: () => chain,
  };
  return { db: chain, directDb: chain };
});

const baseResult = {
  scannedWindowMinutes: 10,
  patternsDetected: [],
  heartbeat: { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: 5 },
  alertsSent: 0,
  alertsFailed: 0,
  errors: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new NextRequest(
    new Request("http://localhost:3000/api/security/siem/run", {
      method: "POST",
      headers,
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Security: SIEM Run — endpoint", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockPlatformRole.current = null;
    const mod = await import("./route");
    POST = mod.POST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin Bearer token y sin usuario → 401", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(createRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
  });

  it("CRON_SECRET incorrecto y sin usuario → 401", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(createRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("CRON_SECRET correcto → 200 y delega a runSiemExport", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockRunSiemExport.mockResolvedValue(baseResult);

    const res = await POST(createRequest("Bearer supersecret"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockRunSiemExport).toHaveBeenCalledTimes(1);
    expect(body.scannedWindowMinutes).toBe(10);
    expect(body.heartbeat).toBeDefined();
    expect(body.durationMs).toBeDefined();
    // El path cron no debe tocar Supabase
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("usuario ADMIN autenticado (sin cron) → 200", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockPlatformRole.current = "admin";
    mockRunSiemExport.mockResolvedValue(baseResult);

    const res = await POST(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("usuario autenticado NO admin (sin cron) → 403", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    mockPlatformRole.current = "client";

    const res = await POST(createRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("admin");
  });

  it("runSiemExport falla → 500", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    mockRunSiemExport.mockRejectedValue(new Error("webhook failure"));

    const res = await POST(createRequest("Bearer supersecret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
  });
});
