/* ═══════════════════════════════════════════════════════════════════════════
   Push Subscribe API — Tests de endpoint (TD-03 lote 3)

   Verifica:
   - POST: auth (401), schema inválido / body no JSON (400), alta nueva
     (200 subscribed), reactivación (200), endpoint duplicado (409), error BD (500)
   - DELETE: auth (401), endpoint ausente (400), desactivación (200), error BD (500)
   - GET: clave VAPID + suscripciones truncadas (200), sin sesión → lista vacía,
     sin VAPID key → supported false, error BD (500)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==== Mocks ================================================================

const mockGetUser = vi.fn();
const mockSelectChain = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockGetVapidPublicKey = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          mockSelectChain().then(resolve, reject),
      };
      return chain;
    },
    update: () => ({
      set: () => ({ where: (...args: unknown[]) => mockUpdate(...args) }),
    }),
    insert: () => ({
      values: (...args: unknown[]) => mockInsert(...args),
    }),
  },
}));

vi.mock("@/server/notifications/push", () => ({
  getVapidPublicKey: () => mockGetVapidPublicKey(),
}));

vi.mock("@/lib/logger", () => ({
  // El mock debe exponer tambien las utilidades de contexto: las rutas usan
  // withRequestContext (src/lib/request-context.ts), que llama a
  // runWithRequestContext desde este mismo modulo. Sin ellas el Partial mock
  // rompe la peticion antes de llegar al handler.
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ==== Helpers ==============================================================

function createRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/notifications/push-subscribe", {
      method,
      headers: { "content-type": "application/json", "user-agent": "vitest-agent" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function createRawRequest(method: string, rawBody: string): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/notifications/push-subscribe", {
      method,
      headers: { "content-type": "application/json", "user-agent": "vitest-agent" },
      body: rawBody,
    }),
  );
}

const validSubscription = {
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc-123",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  },
};

function resetDefaults(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockSelectChain.mockResolvedValue([]);
  mockUpdate.mockResolvedValue(undefined);
  mockInsert.mockResolvedValue(undefined);
  mockGetVapidPublicKey.mockReturnValue("vapid-public-key");
}

// ==== Tests ================================================================

describe("Push Subscribe — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("POST without auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(createRequest("POST", validSubscription));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Not authenticated");
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("POST without subscription → 400", async () => {
    const res = await POST(createRequest("POST", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid subscription object");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST with non-url endpoint → 400", async () => {
    const res = await POST(
      createRequest("POST", { subscription: { endpoint: "not-a-url" } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid subscription object");
  });

  it("POST body not json → 400", async () => {
    const res = await POST(createRawRequest("POST", "<html>oops</html>"));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST new subscription → 200 subscribed", async () => {
    const res = await POST(createRequest("POST", validSubscription));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("subscribed");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("POST existing subscription → 200 reactivated", async () => {
    mockSelectChain.mockResolvedValue([{ id: "sub-1" }]);

    const res = await POST(createRequest("POST", validSubscription));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("reactivated");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST duplicate endpoint of another user → 409", async () => {
    mockInsert.mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    const res = await POST(createRequest("POST", validSubscription));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Endpoint already registered");
  });

  it("POST db error → 500", async () => {
    mockSelectChain.mockRejectedValue(new Error("db down"));

    const res = await POST(createRequest("POST", validSubscription));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});

describe("Push Subscribe — DELETE", () => {
  let DELETE: typeof import("./route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    DELETE = mod.DELETE;
  });

  it("DELETE without auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await DELETE(
      createRequest("DELETE", { endpoint: "https://fcm.googleapis.com/fcm/send/abc-123" }),
    );
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("DELETE without endpoint → 400", async () => {
    const res = await DELETE(createRequest("DELETE", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("endpoint is required");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("DELETE with endpoint → 200 unsubscribed", async () => {
    const res = await DELETE(
      createRequest("DELETE", { endpoint: "https://fcm.googleapis.com/fcm/send/abc-123" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("unsubscribed");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("DELETE db error → 500", async () => {
    mockUpdate.mockRejectedValue(new Error("db down"));

    const res = await DELETE(
      createRequest("DELETE", { endpoint: "https://fcm.googleapis.com/fcm/send/abc-123" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});

describe("Push Subscribe — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("GET returns vapid key and truncated subscriptions", async () => {
    const longEndpoint = `https://fcm.googleapis.com/fcm/send/xyz${"a".repeat(50)}`;
    mockSelectChain.mockResolvedValue([
      { endpoint: longEndpoint, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.publicKey).toBe("vapid-public-key");
    expect(body.supported).toBe(true);
    expect(body.subscriptions).toHaveLength(1);

    const sub = body.subscriptions[0];
    expect(sub.endpoint).toHaveLength(43);
    expect(sub.endpoint.endsWith("...")).toBe(true);
    expect(sub.createdAt).toBe("2026-01-01T00:00:00.000Z");
    // El endpoint completo nunca se expone en la respuesta.
    expect(JSON.stringify(body)).not.toContain("aaaa");
  });

  it("GET without session → empty subscriptions", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.subscriptions).toEqual([]);
    expect(mockSelectChain).not.toHaveBeenCalled();
  });

  it("GET without vapid key → supported false", async () => {
    mockGetVapidPublicKey.mockReturnValue(null);

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publicKey).toBeNull();
    expect(body.supported).toBe(false);
  });

  it("GET db error → 500", async () => {
    mockSelectChain.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
