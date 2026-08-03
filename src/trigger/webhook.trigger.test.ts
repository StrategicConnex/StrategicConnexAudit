/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Webhook Dispatch — Tests del task on-demand (P0)

   Verifica:
   - Registro del task (id + retry maxAttempts 5)
   - Consulta de configs activos por proyecto
   - Filtro por evento suscrito (o "*")
   - POST con firma HMAC-SHA256 y headers X-StrategicAudit-*
   - Validación SSRF vía assertPublicHostname
   - Error en endpoint → lanza (Trigger.dev reintenta)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface WebhookTaskConfig {
  id: string;
  retry: { maxAttempts: number };
  run: (payload: { projectId: string; event: string; data: Record<string, unknown> }, ctx: { ctx: { run: { id: string } } }) => Promise<Record<string, unknown>>;
}

interface WebhookConfig {
  id: string;
  projectId: string;
  active: boolean;
  url: string;
  secretToken: string;
  events: string[];
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn<() => Promise<WebhookConfig[]>>();
const mockAssertPublicHostname = vi.fn<() => Promise<void>>();
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      webhookConfigs: { findMany: mockFindMany },
    },
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  webhookConfigs: { projectId: "projectId", active: "active" },
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: mockAssertPublicHostname,
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  task: vi.fn((config: WebhookTaskConfig) => config),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Trigger: Webhook Dispatch", () => {
  const payload = { projectId: "p1", event: "project.created", data: { id: 1 } };
  const ctx = { ctx: { run: { id: "run-123" } } };
  const config: WebhookConfig = {
    id: "w1",
    projectId: "p1",
    active: true,
    url: "https://hooks.acme.com/receiver",
    secretToken: "sec-123",
    events: ["project.created"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertPublicHostname.mockResolvedValue();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registra el task con id y retry correctos", async () => {
    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    expect(task.id).toBe("dispatch-webhook-task");
    expect(task.retry.maxAttempts).toBe(5);
  });

  it("sin configs activos → delivered 0 y sin fetch", async () => {
    mockFindMany.mockResolvedValue([]);

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.delivered).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("config suscrito al evento → POST con firma HMAC y delivered 1", async () => {
    mockFindMany.mockResolvedValue([config]);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.delivered).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.acme.com/receiver");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-StrategicAudit-Event"]).toBe("project.created");
    expect(headers["X-StrategicAudit-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    // el body incluye el run id y el evento
    const body = JSON.parse(init?.body as string);
    expect(body.id).toBe("run-123");
    expect(body.event).toBe("project.created");
    expect(body.data.id).toBe(1);
  });

  it("config no suscrito al evento (sin *) → se omite y delivered 0", async () => {
    mockFindMany.mockResolvedValue([{ ...config, events: ["other.event"] }]);

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.delivered).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("config con events ['*'] → recibe todos los eventos", async () => {
    mockFindMany.mockResolvedValue([{ ...config, events: ["*"] }]);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    const result = await task.run(payload, ctx);

    expect(result.delivered).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("endpoint responde 500 → lanza (Trigger.dev reintenta)", async () => {
    mockFindMany.mockResolvedValue([config]);
    mockFetch.mockResolvedValue(new Response(null, { status: 500, statusText: "Server Error" }));

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    await expect(task.run(payload, ctx)).rejects.toThrow(/500/);
  });

  it("assertPublicHostname rechaza (SSRF) → lanza y no hace fetch", async () => {
    mockFindMany.mockResolvedValue([config]);
    mockAssertPublicHostname.mockRejectedValue(new Error("IP privada bloqueada"));

    const { dispatchWebhookTask } = await import("./webhook.trigger");
    const task = dispatchWebhookTask as unknown as WebhookTaskConfig;
    await expect(task.run(payload, ctx)).rejects.toThrow(/IP privada/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
