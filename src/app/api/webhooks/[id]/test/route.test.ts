/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/webhooks/[id]/test — Tests (Tanda 4 / B7)

   Verifica el contrato honesto: 200 SOLO si el destino aceptó la entrega;
   502 con el error real si falló; 401/400/404 según corresponda.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

if (!process.env.DATA_ENCRYPTION_KEY) {
  process.env.DATA_ENCRYPTION_KEY = "ab".repeat(32);
}

const mockGetUser = vi.fn();
const mockProjectFindFirst = vi.fn();
const mockWebhookFindFirst = vi.fn();
const mockFetch = vi.fn();
const mockAssertHost = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: {
        projects: { findFirst: mockProjectFindFirst },
        webhookConfigs: { findFirst: mockWebhookFindFirst },
      },
    }),
  ),
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id" },
  webhookConfigs: { id: "id", projectId: "projectId" },
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: mockAssertHost,
}));

vi.mock("@/server/lib/field-crypto", () => ({
  decryptField: (v: string) => v,
  encryptField: (v: string) => v,
  maskSecret: (v: string | null) => v,
}));

function post(path = "/api/webhooks/wh-1/test?projectId=project-1"): NextRequest {
  return new NextRequest(new Request(`http://localhost:3000${path}`, { method: "POST" }));
}

const config = {
  id: "wh-1",
  projectId: "project-1",
  url: "https://hooks.acme.com/receiver",
  secretToken: "whsec_test",
  events: ["finding.critical"],
  active: true,
};

describe("POST /api/webhooks/[id]/test", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockAssertHost.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockProjectFindFirst.mockResolvedValue({ id: "project-1" });
    mockWebhookFindFirst.mockResolvedValue(config);
    ({ POST } = await import("./route"));
  });

  it("sin auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  it("sin projectId → 400", async () => {
    const res = await POST(post("/api/webhooks/wh-1/test"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("id o projectId");
  });

  it("proyecto ajeno o inexistente → 404", async () => {
    mockProjectFindFirst.mockResolvedValue(undefined);
    const res = await POST(post());
    expect(res.status).toBe(404);
  });

  it("webhook de otro proyecto → 404", async () => {
    mockWebhookFindFirst.mockResolvedValue(undefined);
    const res = await POST(post());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Webhook no encontrado");
  });

  it("destino 200 → 200 con delivered 1 y evento webhook.test firmado", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    const res = await POST(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, delivered: 1, status: 200 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-StrategicAudit-Event"]).toBe("webhook.test");
    expect(headers["X-StrategicAudit-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("destino 500 → 502 con el error real (no un falso 200)", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500, statusText: "Boom" }));
    const res = await POST(post());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("500");
  });

  it("destino no alcanzable → 502 con el mensaje de red", async () => {
    mockFetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const res = await POST(post());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("ENOTFOUND");
  });

  it("URL privada (SSRF) → 502 sin fetch", async () => {
    mockAssertHost.mockRejectedValue(new Error("Host privado bloqueado"));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
