import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());
const logSecurityEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/db", () => ({ directDb: { insert: insertMock } }));
vi.mock("@/shared/db/schemas", () => ({ siemAlertLogs: {} }));
vi.mock("@/shared/lib/audit-log", () => ({ logSecurityEvent: logSecurityEventMock }));

import { escapeHtml, sendTestAlert, persistDelivery, WEBHOOK_FORMATTERS } from "./siem-exporter";
import type { SiemPattern } from "./siem-exporter";

const pattern: SiemPattern = {
  eventType: "dns_change_detected",
  ip: "example.com",
  count: 2,
  windowMinutes: 60,
  severity: "warning",
  label: "⚠️ DNS Change",
  firstSeen: new Date("2026-01-01T10:00:00Z"),
  lastSeen: new Date("2026-01-01T10:05:00Z"),
  paths: ["/api/intelligence/history"],
  methods: ["DNS_SCAN"],
  metadataSamples: [],
};

describe("siem-exporter — escapeHtml", () => {
  it("escapa los 5 caracteres peligrosos", () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#039;y&#039;)&lt;/script&gt;"
    );
  });

  it("no altera texto plano", () => {
    expect(escapeHtml("texto normal 123")).toBe("texto normal 123");
  });
});

describe("siem-exporter — sendTestAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "https://hooks.slack.com/services/t");
    vi.stubEnv("SIEM_WEBHOOK_PAGERDUTY", "https://events.pagerduty.com/v2/enqueue/t");
    vi.stubEnv("SIEM_WEBHOOK_SPLUNK", "https://splunk.local/services/collector/t");
    vi.stubEnv("RESEND_API_KEY", "re_test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin webhooks configurados devuelve error de sistema", async () => {
    vi.stubEnv("SIEM_WEBHOOK_SLACK", "");
    vi.stubEnv("SIEM_WEBHOOK_PAGERDUTY", "");
    vi.stubEnv("SIEM_WEBHOOK_SPLUNK", "");
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendTestAlert();
    expect(result.targetsAttempted).toBe(0);
    expect(result.success).toBe(false);
    expect(result.details[0].name).toBe("system");
  });

  it("envía a todos los canales configurados y reporta éxito si todos OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })));

    const result = await sendTestAlert();

    expect(result.targetsAttempted).toBe(4);
    expect(result.success).toBe(true);
    expect(result.details.every((d) => d.status === "ok")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("un canal fallido marca el test como error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("splunk")
        ? { ok: false, status: 401, text: async () => "unauthorized" }
        : { ok: true, status: 200, text: async () => "" }
    ));

    const result = await sendTestAlert();

    expect(result.targetsAttempted).toBe(4);
    expect(result.success).toBe(false);
    const splunk = result.details.find((d) => d.name === "Splunk");
    expect(splunk?.status).toBe("error");
    expect(splunk?.message).toContain("401");
  });

  it("excepción de fetch en un canal se registra como error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("pagerduty")) throw new Error("conn refused");
      return { ok: true, status: 200, text: async () => "" };
    }));

    const result = await sendTestAlert();

    const pd = result.details.find((d) => d.name === "PagerDuty");
    expect(pd?.status).toBe("error");
    expect(pd?.message).toContain("conn refused");
  });
});

describe("siem-exporter — persistDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({ values: vi.fn(async () => undefined) }));
  });

  it("persiste el delivery con metadata", async () => {
    const valuesSpy = vi.fn(async (_values: {
      ruleEventType?: string; ip?: string; severity?: string; label?: string;
      count?: number; windowMinutes?: number; target?: string; status?: string;
      responseCode?: number | null; errorMessage?: string | null;
      metadata?: Record<string, unknown>; detectedAt?: Date;
    }) => undefined);
    insertMock.mockImplementation(() => ({ values: valuesSpy }));

    await persistDelivery(pattern, "Slack", "success", 200, null, { extra: 1 });

    const values = valuesSpy.mock.calls[0]![0]!;
    expect(values.ruleEventType).toBe("dns_change_detected");
    expect(values.target).toBe("Slack");
    expect(values.status).toBe("success");
    expect(values.responseCode).toBe(200);
    expect(values.metadata?.extra).toBe(1);
  });

  it("fallo de DB no lanza (fail-safe)", async () => {
    insertMock.mockImplementation(() => ({
      values: vi.fn(async () => { throw new Error("db down"); }),
    }));
    await expect(persistDelivery(pattern, "Slack", "failed", 500, "err")).resolves.toBeUndefined();
  });
});

describe("siem-exporter — catálogo de canales", () => {
  it("expone los 4 canales con su envVar y nombre", () => {
    const names = WEBHOOK_FORMATTERS.map((w) => w.name);
    expect(names).toEqual(["Slack", "PagerDuty", "Splunk", "Email"]);
  });
});
