/* ═══════════════════════════════════════════════════════════════════════════
   Bulk Scan — Tests de endpoint (TD-03 lote 3)

   Encola escaneos masivos con rate limit (authenticate) + RLS. Verifica:
   - 401 sin sesión (authenticate → null)
   - 400 en validación zod: uuid, lista vacía y >10 targets
   - 404 si el proyecto no existe; errores de programación de trabajo
   - 200 con targets normalizados, disparados internamente sin credenciales
   - Caso borde: targets en blanco se omiten (0 en cola)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  user: { current: { id: "u-1" } as { id: string } | null },
  findFirst: vi.fn(),
  after: vi.fn(),
  runIntelligenceScan: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user.current } }) },
  }),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (
    config: { authenticate?: (req: Request) => Promise<{ id: string } | null> },
    handler: (req: NextRequest, userId: string) => Promise<Response>,
  ) =>
    async (req: NextRequest): Promise<Response> => {
      if (!config.authenticate) return handler(req, "");
      const user = await config.authenticate(req);
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return handler(req, user.id);
    },
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: { projects: { findFirst: (...args: unknown[]) => mocks.findFirst(...args) } },
    }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

vi.mock("@/app/api/intelligence/route", () => ({
  POST: mocks.runIntelligenceScan,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/bulk-scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const PROJECT_ID = "2a7cff00-0000-4000-8000-000000000001";
const validBody = {
  projectId: PROJECT_ID,
  targets: ["Example.COM", "user@Host.io", "https://a.example"],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Bulk Scan — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.user.current = { id: "u-1" };
    mocks.findFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.runIntelligenceScan.mockResolvedValue(new Response(null, { status: 200 }));
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin sesión → 401", async () => {
    mocks.user.current = null;

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.runIntelligenceScan).not.toHaveBeenCalled();
  });

  it("projectId que no es uuid → 400", async () => {
    const res = await POST(createRequest({ projectId: "not-a-uuid", targets: ["a.com"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Argumentos inválidos");
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("targets vacíos → 400", async () => {
    const res = await POST(createRequest({ projectId: PROJECT_ID, targets: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Argumentos inválidos");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("11 targets → 400 por el límite de 10", async () => {
    const res = await POST(
      createRequest({
        projectId: PROJECT_ID,
        targets: Array.from({ length: 11 }, (_, i) => `t${i}.com`),
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("proyecto no encontrado → 404", async () => {
    mocks.findFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");

    expect(mocks.runIntelligenceScan).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("agenda los escaneos en el handler interno sin reenviar credenciales ni usar fetch", async () => {
    const req = createRequest(validBody);
    req.headers.set("cookie", "session=secret");
    req.headers.set("authorization", "Bearer secret");

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("3 escaneos en cola con éxito.");
    expect(body.queued).toEqual([
      { target: "example.com", status: "queued" },
      { target: "user@host.io", status: "queued" },
      { target: "https://a.example", status: "queued" },
    ]);

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runIntelligenceScan).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    const [backgroundWork] = mocks.after.mock.calls[0] as [() => Promise<void>];
    await backgroundWork();

    expect(mocks.runIntelligenceScan).toHaveBeenCalledTimes(3);
    expect(mocks.fetch).not.toHaveBeenCalled();
    const [scanRequest] = mocks.runIntelligenceScan.mock.calls[0] as [NextRequest];
    expect(scanRequest.url).toBe("http://internal/api/intelligence");
    expect(scanRequest.headers.get("cookie")).toBeNull();
    expect(scanRequest.headers.get("authorization")).toBeNull();
    await expect(scanRequest.json()).resolves.toEqual({ target: "example.com", projectId: PROJECT_ID });
  });

  it("targets en blanco se omiten → 0 en cola", async () => {
    const res = await POST(createRequest({ projectId: PROJECT_ID, targets: ["   "] }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("0 escaneos en cola con éxito.");
    expect(body.queued).toEqual([]);

    expect(mocks.runIntelligenceScan).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

});
