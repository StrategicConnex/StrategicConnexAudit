/* ═══════════════════════════════════════════════════════════════════════════
   Entrega de webhooks (Tanda 4 / B7)

   Este módulo es el camino ÚNICO de entrega: lo usan el task de Trigger.dev y
   el endpoint de prueba. Los tests fijan las garantías que ambos comparten.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  buildWebhookBody,
  signWebhookBody,
  isSubscribedToEvent,
  deliverWebhook,
  deliverWebhooks,
  type DeliveryDeps,
  type WebhookDeliveryTarget,
} from "./delivery";

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: vi.fn(async (h: string) => h),
}));

vi.mock("@/server/lib/field-crypto", () => ({
  // Los secretos legados viajan en claro: el "descifrado" los devuelve tal cual.
  decryptField: vi.fn((v: string) => v),
}));

function makeDeps(overrides: Partial<DeliveryDeps> = {}): DeliveryDeps {
  return {
    fetchImpl: vi.fn(async () => new Response(null, { status: 200 })),
    now: () => new Date("2026-10-06T08:00:00.000Z"),
    decrypt: (v: string) => v,
    assertHost: vi.fn(async () => {}),
    logger: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

const target: WebhookDeliveryTarget = {
  id: "wh-1",
  url: "https://hooks.acme.com/receiver",
  secretToken: "whsec_test",
  events: ["finding.created"],
};

describe("delivery — cuerpo y firma", () => {
  it("el cuerpo incluye id, event, timestamp y data", () => {
    const body = buildWebhookBody(
      { id: "run-1", event: "finding.created", data: { count: 2 } },
      new Date("2026-10-06T08:00:00.000Z"),
    );
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      id: "run-1",
      event: "finding.created",
      timestamp: "2026-10-06T08:00:00.000Z",
      data: { count: 2 },
    });
  });

  it("respeta el timestamp explícito del payload", () => {
    const body = buildWebhookBody(
      { id: "run-1", event: "x", data: {}, timestamp: "2020-01-01T00:00:00.000Z" },
      new Date("2026-10-06T08:00:00.000Z"),
    );
    expect(JSON.parse(body).timestamp).toBe("2020-01-01T00:00:00.000Z");
  });

  it("la firma HMAC-SHA256 se calcula sobre el cuerpo exacto", () => {
    const body = '{"a":1}';
    expect(signWebhookBody(body, "secret")).toBe(
      crypto.createHmac("sha256", "secret").update(body).digest("hex"),
    );
  });
});

describe("delivery — suscripción", () => {
  it("suscripción vacía = todos (compat)", () => {
    expect(isSubscribedToEvent([], "finding.created")).toBe(true);
    expect(isSubscribedToEvent(null, "finding.created")).toBe(true);
  });

  it("'*' recibe todo; lista explícita filtra", () => {
    expect(isSubscribedToEvent(["*"], "uptime.down")).toBe(true);
    expect(isSubscribedToEvent(["uptime.down"], "uptime.down")).toBe(true);
    expect(isSubscribedToEvent(["uptime.down"], "finding.created")).toBe(false);
  });
});

describe("delivery — deliverWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("200 → ok con status y firma correcta en la cabecera", async () => {
    const deps = makeDeps();
    const result = await deliverWebhook(
      target,
      { id: "run-1", event: "finding.created", data: { count: 1 } },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const [url, init] = (deps.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(target.url);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-StrategicAudit-Event"]).toBe("finding.created");
    const expected = crypto
      .createHmac("sha256", "whsec_test")
      .update(init.body as string)
      .digest("hex");
    expect(headers["X-StrategicAudit-Signature"]).toBe(`sha256=${expected}`);
  });

  it("500 → ok false con status, sin lanzar", async () => {
    const deps = makeDeps({
      fetchImpl: vi.fn(async () => new Response(null, { status: 500, statusText: "Server Error" })),
    });
    const result = await deliverWebhook(target, { id: "r", event: "e", data: {} }, deps);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toContain("500");
  });

  it("host privado (SSRF) → ok false y NO se hace fetch", async () => {
    const deps = makeDeps({
      assertHost: vi.fn(async () => {
        throw new Error("IP privada bloqueada");
      }),
    });
    const result = await deliverWebhook(target, { id: "r", event: "e", data: {} }, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("IP privada");
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("URL inválida → ok false sin lanzar", async () => {
    const deps = makeDeps();
    const result = await deliverWebhook({ ...target, url: "no-es-una-url" }, { id: "r", event: "e", data: {} }, deps);
    expect(result.ok).toBe(false);
  });
});

describe("delivery — deliverWebhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("solo entrega a los suscritos y resume el resultado", async () => {
    const deps = makeDeps();
    const summary = await deliverWebhooks(
      [
        { ...target, id: "a" },
        { ...target, id: "b", events: ["uptime.down"] },
        { ...target, id: "c", events: ["*"] },
      ],
      { id: "run-1", event: "finding.created", data: {} },
      deps,
    );

    expect(summary.delivered).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.results.map((r) => r.configId)).toEqual(["a", "c"]);
    expect(summary.firstError).toBeNull();
  });

  it("un destino caído no impide entregar a los demás y expone el primer error", async () => {
    let call = 0;
    const deps = makeDeps({
      fetchImpl: vi.fn(async () => {
        call += 1;
        return call === 1
          ? new Response(null, { status: 503, statusText: "Unavailable" })
          : new Response(null, { status: 200 });
      }),
    });

    const summary = await deliverWebhooks(
      [{ ...target, id: "a" }, { ...target, id: "b" }],
      { id: "run-1", event: "finding.created", data: {} },
      deps,
    );

    expect(summary.delivered).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.firstError).toContain("503");
  });

  it("sin destinos suscritos → 0 entregas sin fetch", async () => {
    const deps = makeDeps();
    const summary = await deliverWebhooks(
      [{ ...target, events: ["uptime.down"] }],
      { id: "run-1", event: "finding.created", data: {} },
      deps,
    );
    expect(summary.delivered).toBe(0);
    expect(summary.failed).toBe(0);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});
