/* ═══════════════════════════════════════════════════════════════════════════
   SIEM Exporter — Integration Test

   Verifica que runSiemExport() funciona correctamente en un entorno aislado:
   - Sin Redis (mocks)
   - Sin webhooks reales (mock de fetch)
   - Sin base de datos real (mock de directDb)
   - El heartbeat se dispara cuando corresponde
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runSiemExport, sendTestAlert } from "./siem-exporter";

// ─── Shared mutable mock state ──────────────────────────────────────────────
// vitest hoista vi.mock al tope del archivo. Usamos variables compartidas
// para que cada test pueda controlar lo que devuelven las queries.

let mockDbResult: any = [];           // Resultado de directDb.select().then()
const mockInsertValues = vi.fn();     // Spy para directDb.insert().values()
const mockLogEvent = vi.fn();         // Spy para logSecurityEvent

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock fetch global
const mockFetchResponse = vi.fn();
vi.stubGlobal("fetch", mockFetchResponse);

// Mock Drizzle query builder con Proxy.
// select().from().where().groupBy().orderBy().limit().offset() → Promise que resuelve a mockDbResult
vi.mock("@/shared/db", () => {
  // Builder proxy: toda llamada encadenada retorna el mismo builder,
  // y await (then) resuelve a mockDbResult
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (r: any) => r(mockDbResult);
        if (prop === "catch") return () => undefined;
        return () => builder;
      },
    }
  );

  return {
    directDb: {
      insert: vi.fn(() => ({
        values: mockInsertValues,
      })),
      select: vi.fn(() => builder),
    },
  };
});

// Mock audit-log
vi.mock("@/shared/lib/audit-log", () => ({
  logSecurityEvent: (...args: any[]) => mockLogEvent(...args),
}));

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("SIEM Exporter — Heartbeat Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset shared mock state
    mockDbResult = [];

    // fetch por defecto retorna 200 OK
    mockFetchResponse.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("OK"),
    });

    // Configurar webhook Slack
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "https://hooks.slack.com/test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─── Test 1: Heartbeat en primera ejecución ──────────────────────────────

  it("debería disparar heartbeat cuando no hay heartbeat previo", async () => {
    // mockDbResult = [] → queryAggregated = [] (sin eventos)
    //                  → lastHeartbeatTime = [] (sin heartbeat previo → due = true)

    const result = await runSiemExport();

    // Sin eventos → sin patrones
    expect(result.patternsDetected).toEqual([]);
    expect(result.alertsSent).toBe(0);
    expect(result.errors).toEqual([]);

    // Heartbeat disparado (primera vez)
    expect(result.heartbeat.sent).toBe(true);
    expect(result.heartbeat.reason).toBe("due");
    expect(result.heartbeat.lastHeartbeatAgoMinutes).toBeNull();

    // fetch llamado 1 vez (Slack)
    expect(mockFetchResponse).toHaveBeenCalledTimes(1);
    const fetchCall = mockFetchResponse.mock.calls[0];
    expect(fetchCall[0]).toBe("https://hooks.slack.com/test");
    expect(fetchCall[1].method).toBe("POST");

    // Body contiene heartbeat
    const body = JSON.parse(fetchCall[1].body);
    expect(body.blocks[0].text.text).toContain("SIEM Heartbeat");
    expect(body.blocks[0].text.text).toContain("system");
  });

  // ─── Test 2: Heartbeat omitido si hay uno reciente ──────────────────────

  it("debería omitir heartbeat si ya se envió hace menos de 30 min", async () => {
    // Simular heartbeat hace 15 minutos
    mockDbResult = [{ createdAt: new Date(Date.now() - 15 * 60 * 1000) }];

    const result = await runSiemExport();

    // Heartbeat NO enviado (solo 15 min)
    expect(result.heartbeat.sent).toBe(false);
    expect(result.heartbeat.reason).toBe("skipped_recent");
    expect(result.heartbeat.lastHeartbeatAgoMinutes).toBe(15);

    // fetch NO debe llamarse
    expect(mockFetchResponse).not.toHaveBeenCalled();
  });

  // ─── Test 3: Sin webhooks configurados ──────────────────────────────────

  it("debería reportar 'no webhooks' si no hay webhooks configurados", async () => {
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "");

    const result = await runSiemExport();

    expect(result.heartbeat.sent).toBe(false);
    expect(result.heartbeat.reason).toBe("no_webhooks");
    expect(mockFetchResponse).not.toHaveBeenCalled();
  });

  // ─── Test 4: Heartbeat + patrones simultáneamente ────────────────────────

  it("debería enviar heartbeat incluso si hay patrones detectados", async () => {
    // queryAggregated recibe el evento rate_limit_hit (lastHeartbeatTime también recibe
    // estos datos pero no tiene createdAt → last es undefined/null → due = true)
    mockDbResult = [
      {
        eventType: "rate_limit_hit",
        ip: "192.168.1.100",
        count: 25,
        firstSeen: new Date(Date.now() - 120_000),
        lastSeen: new Date(),
      },
    ];

    const result = await runSiemExport();

    // Patrón rate_limit_hit detectado
    expect(result.patternsDetected.length).toBeGreaterThan(0);
    expect(result.patternsDetected[0].eventType).toBe("rate_limit_hit");

    // Heartbeat también enviado (no había heartbeat con createdAt en mock)
    expect(result.heartbeat.sent).toBe(true);
    expect(result.heartbeat.reason).toBe("due");

    // fetch llamado al menos 1 vez (heartbeat a Slack)
    expect(mockFetchResponse).toHaveBeenCalled();
  });

  // ─── Test 5: Persistencia en siem_alert_logs ─────────────────────────────

  it("debería persistir delivery del heartbeat en siem_alert_logs", async () => {
    await runSiemExport();

    // insert().values() debe haberse llamado con datos del heartbeat
    expect(mockInsertValues).toHaveBeenCalled();

    // Buscar la llamada con ruleEventType === "heartbeat"
    const hbCalls = mockInsertValues.mock.calls.filter(
      (c: any) => c[0]?.ruleEventType === "heartbeat"
    );
    expect(hbCalls.length).toBeGreaterThanOrEqual(1);

    const hbValues = hbCalls[0][0];
    expect(hbValues.ruleEventType).toBe("heartbeat");
    expect(hbValues.status).toBe("success");
    expect(hbValues.target).toBe("Slack");
    expect(hbValues.severity).toBe("info");
    expect(hbValues.count).toBe(0);
    expect(hbValues.windowMinutes).toBe(30);
    expect(hbValues.ip).toBe("system");
  });

  // ─── Test 6: Fail-safe ante error de fetch ───────────────────────────────

  it("no debería lanzar excepción si fetch falla (fail-safe)", async () => {
    mockFetchResponse.mockRejectedValue(new Error("Connection refused"));

    const result = await runSiemExport();

    expect(result.heartbeat.sent).toBe(false);
    expect(result.heartbeat.reason).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // ─── Test 7: scannedWindowMinutes ────────────────────────────────────────

  it("debería retornar scannedWindowMinutes correcto (máximo de reglas)", async () => {
    const result = await runSiemExport();

    // El máximo windowMinutes es 10 (csp_violation)
    expect(result.scannedWindowMinutes).toBe(10);
  });

  // ─── Test 8: sendTestAlert sin webhooks ─────────────────────────────

  it("sendTestAlert: sin webhooks → error limpio", async () => {
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "");
    vi.stubEnv("SIEM_WEBHOOK_PAGERDUTY", "");
    vi.stubEnv("SIEM_WEBHOOK_SPLUNK", "");

    const result = await sendTestAlert();

    expect(result.targetsAttempted).toBe(0);
    expect(result.success).toBe(false);
    expect(result.details[0].message).toContain("No hay webhooks");
  });
});
