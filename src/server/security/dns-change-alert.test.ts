import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logSecurityEventMock = vi.hoisted(() => vi.fn());
const persistDeliveryMock = vi.hoisted(() => vi.fn(async () => undefined));
const formatterMock = vi.hoisted(() => vi.fn((p: unknown) => ({
  url: "https://hooks.slack.com/services/xxx",
  headers: {},
  body: { text: JSON.stringify(p) },
})));

vi.mock("@/shared/lib/audit-log", () => ({ logSecurityEvent: logSecurityEventMock }));
vi.mock("@/server/security/siem-exporter", () => ({
  WEBHOOK_FORMATTERS: [{ envVar: "SIEM_WEBHOOK_SLACK", name: "Slack", formatter: formatterMock }],
  persistDelivery: persistDeliveryMock,
}));

import { sendDnsChangeAlerts } from "./dns-change-alert";
import type { DnsChange } from "@/server/intelligence/history/types";    const changes: DnsChange[] = [
      {
        recordType: "MX",
        type: "removed",
        query: "example.com",
        previousValue: "mail.old.com",
        currentValue: null,
        detectedAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        recordType: "A",
        type: "added",
        query: "example.com",
        previousValue: null,
        currentValue: "203.0.113.9",
        detectedAt: new Date("2026-01-01T10:05:00Z"),
      },
    ];

describe("sendDnsChangeAlerts — alertas SIEM por cambios DNS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "https://hooks.slack.com/services/xxx");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin cambios devuelve resultado vacío sin enviar nada", async () => {
    const result = await sendDnsChangeAlerts("example.com", []);
    expect(result.changesDetected).toBe(0);
    expect(result.alertsSent).toBe(0);
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it("sin canales configurados registra error y no hace fetch", async () => {
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "");
    vi.stubGlobal("fetch", vi.fn());

    const result = await sendDnsChangeAlerts("example.com", changes);

    expect(result.alertsSent).toBe(0);
    expect(result.errors.some((e) => e.includes("No hay canales"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clasifica severidades por tipo de cambio (critical/warning/info)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    const mixed: DnsChange[] = [
      { recordType: "NS", type: "removed", query: "example.com", previousValue: "ns1.old.com", currentValue: null, detectedAt: new Date() }, // critical
      { recordType: "A", type: "changed", query: "example.com", previousValue: "1.1.1.1", currentValue: "2.2.2.2", detectedAt: new Date() }, // warning
      { recordType: "TXT", type: "added", query: "example.com", previousValue: null, currentValue: "v=spf1 -all", detectedAt: new Date() }, // info
    ];

    const result = await sendDnsChangeAlerts("example.com", mixed);
    const sevByType = Object.fromEntries(result.changes.map((c) => [c.type, c.severity]));
    expect(sevByType["removed"]).toBe("critical");
    expect(sevByType["changed"]).toBe("warning");
    expect(sevByType["added"]).toBe("info");
    // El logSecurityEvent se llama por cada cambio
    expect(logSecurityEventMock).toHaveBeenCalledTimes(3);
  });

  it("envía alerta exitosa, persiste delivery success y loguea eventos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    const result = await sendDnsChangeAlerts("example.com", changes);

    expect(result.alertsSent).toBe(1);
    expect(result.alertsFailed).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/xxx",
      expect.objectContaining({ method: "POST" })
    );
    expect(persistDeliveryMock).toHaveBeenCalledWith(
      expect.anything(), "Slack", "success", 200, null
    );
    // Un logSecurityEvent por cambio
    expect(logSecurityEventMock).toHaveBeenCalledTimes(2);
  });

  it("fallo HTTP registra error y persiste delivery failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "internal error",
    })));

    const result = await sendDnsChangeAlerts("example.com", changes);

    expect(result.alertsSent).toBe(0);
    expect(result.alertsFailed).toBe(1);
    expect(result.errors.some((e) => e.includes("[Slack]"))).toBe(true);
    expect(persistDeliveryMock).toHaveBeenCalledWith(
      expect.anything(), "Slack", "failed", 500, expect.stringContaining("internal error")
    );
  });

  it("excepción de fetch se captura como fallida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND hooks.slack.com"); }));

    const result = await sendDnsChangeAlerts("example.com", changes);

    expect(result.alertsFailed).toBe(1);
    expect(result.errors.some((e) => e.includes("ENOTFOUND"))).toBe(true);
    expect(persistDeliveryMock).toHaveBeenCalledWith(
      expect.anything(), "Slack", "failed", null, expect.anything()
    );
  });

  it("un error interno global no rompe el resultado (catch final)", async () => {
    // Formatter que lanza dentro de sendDnsAlerts
    formatterMock.mockImplementationOnce(() => { throw new Error("formatter boom"); });
    vi.stubGlobal("fetch", vi.fn());

    const result = await sendDnsChangeAlerts("example.com", changes);

    expect(result.alertsFailed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
