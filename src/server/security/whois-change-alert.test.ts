import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logSecurityEventMock = vi.hoisted(() => vi.fn());
const persistDeliveryMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/shared/lib/audit-log", () => ({ logSecurityEvent: logSecurityEventMock }));
vi.mock("@/server/security/siem-exporter", () => ({
  WEBHOOK_FORMATTERS: [{ envVar: "SIEM_WEBHOOK_SLACK", name: "Slack", formatter: vi.fn((p: unknown) => ({
    url: "https://hooks.slack.com/services/yyy",
    headers: {},
    body: { text: JSON.stringify(p) },
  })) }],
  persistDelivery: persistDeliveryMock,
}));

import { sendWhoisChangeAlerts } from "./whois-change-alert";
import type { WhoisChange } from "@/server/intelligence/history/types";

const changes: WhoisChange[] = [
  {
    field: "registrar",
    label: "Registrador",
    previousValue: "GoDaddy",
    currentValue: "Namecheap",
    severity: "warning",
    detectedAt: new Date("2026-01-01T10:00:00Z"),
  },
];

describe("sendWhoisChangeAlerts — alertas SIEM por cambios WHOIS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "https://hooks.slack.com/services/yyy");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin cambios devuelve resultado vacío", async () => {
    const result = await sendWhoisChangeAlerts("example.com", []);
    expect(result.changesDetected).toBe(0);
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it("sin canales configurados registra error", async () => {
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "");
    vi.stubGlobal("fetch", vi.fn());

    const result = await sendWhoisChangeAlerts("example.com", changes);
    expect(result.alertsSent).toBe(0);
    expect(result.errors.some((e) => e.includes("No hay canales"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envía alerta exitosa y persiste success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    const result = await sendWhoisChangeAlerts("example.com", changes);

    expect(result.alertsSent).toBe(1);
    expect(result.alertsFailed).toBe(0);
    expect(persistDeliveryMock).toHaveBeenCalledWith(
      expect.anything(), "Slack", "success", 200, null
    );
    expect(logSecurityEventMock).toHaveBeenCalledTimes(1);
  });

  it("fallo HTTP persiste delivery failed y registra error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    })));

    const result = await sendWhoisChangeAlerts("example.com", changes);

    expect(result.alertsFailed).toBe(1);
    expect(result.errors.some((e) => e.includes("[Slack] 502"))).toBe(true);
    expect(persistDeliveryMock).toHaveBeenCalledWith(
      expect.anything(), "Slack", "failed", 502, expect.anything()
    );
  });

  it("excepción de fetch se captura como fallida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));

    const result = await sendWhoisChangeAlerts("example.com", changes);

    expect(result.alertsFailed).toBe(1);
    expect(result.errors.some((e) => e.includes("timeout"))).toBe(true);
  });
});
