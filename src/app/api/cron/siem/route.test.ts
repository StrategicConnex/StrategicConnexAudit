/* ═══════════════════════════════════════════════════════════════════════════
   Cron: SIEM Exporter — Tests de endpoint
   
   Verifica:
   - Autenticación CRON_SECRET en producción
   - Ejecución exitosa delega a runSiemExport
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunSiemExport = vi.fn();

vi.mock("@/server/security/siem-exporter", () => ({
  runSiemExport: mockRunSiemExport,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cron: SIEM — Auth", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("producción sin CRON_SECRET → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "supersecret");

    const req = new Request("http://localhost:3000/api/cron/siem", {});
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("producción con CRON_SECRET incorrecto → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "supersecret");

    const req = new Request("http://localhost:3000/api/cron/siem", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("producción con CRON_SECRET correcto → 200 + resultado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "supersecret");

    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [],
      heartbeat: { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: 5 },
      alertsSent: 0,
      alertsFailed: 0,
      errors: [],
    });

    const req = new Request("http://localhost:3000/api/cron/siem", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.scannedWindowMinutes).toBe(10);
    expect(body.heartbeat).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.nodeEnv).toBe("production");
  });

  it("desarrollo sin auth → 200 (no requiere CRON_SECRET)", async () => {
    vi.stubEnv("NODE_ENV", "development");

    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [],
      heartbeat: { sent: false, reason: "skipped_recent", lastHeartbeatAgoMinutes: null },
      alertsSent: 0,
      alertsFailed: 0,
      errors: [],
    });

    const req = new Request("http://localhost:3000/api/cron/siem", {});
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("delega a runSiemExport y retorna resultado completo", async () => {
    vi.stubEnv("NODE_ENV", "development");

    mockRunSiemExport.mockResolvedValue({
      scannedWindowMinutes: 10,
      patternsDetected: [
        { eventType: "open_redirect_attempt", ip: "10.0.0.5", severity: "critical", label: "🚨 Open Redirect Attack" },
      ],
      heartbeat: { sent: true, reason: "due", lastHeartbeatAgoMinutes: null },
      alertsSent: 1,
      alertsFailed: 0,
      errors: [],
    });

    const req = new Request("http://localhost:3000/api/cron/siem", {});
    const res = await GET(req);
    const body = await res.json();

    expect(mockRunSiemExport).toHaveBeenCalledTimes(1);
    expect(body.patternsDetected.length).toBe(1);
    expect(body.patternsDetected[0].eventType).toBe("open_redirect_attempt");
    expect(body.alertsSent).toBe(1);
  });
});
