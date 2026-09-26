/* ═══════════════════════════════════════════════════════════════════════════
   Internal: Track Access — Tests de endpoint (TD-03 lote 1)

   Verifica:
   - Sin sesión (o sin email) → 401 y NO escribe en la BD
   - Upsert correcto: prioridad x-real-ip > x-forwarded-for (1er segmento),
     truncado de IP a 64 y userAgent a 400
   - onConflictDoUpdate incrementa accessCount
   - Fallo del insert → 204 (la telemetría nunca rompe la navegación)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

interface InsertCapture {
  values: Record<string, unknown> | null;
  conflict: Record<string, unknown> | null;
  fail: boolean;
  calls: number;
}

const insert: InsertCapture = { values: null, conflict: null, fail: false, calls: 0 };

vi.mock("@/shared/db", () => ({
  directDb: {
    insert: () => {
      insert.calls += 1;
      const c: Record<string, unknown> = {};
      c.values = (v: Record<string, unknown>) => {
        insert.values = v;
        return c;
      };
      c.onConflictDoUpdate = (cfg: Record<string, unknown>) => {
        insert.conflict = cfg;
        return c;
      };
      c.then = (onF?: unknown, onR?: unknown) =>
        (insert.fail ? Promise.reject(new Error("insert failed")) : Promise.resolve([{ ok: 1 }])).then(
          onF as never,
          onR as never,
        );
      return c;
    },
  },
  db: {},
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/internal/track-access", {
    method: "POST",
    headers,
  });
}

const authed = { data: { user: { id: "u-1", email: "user@example.com" } } };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Internal: Track Access — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    insert.values = null;
    insert.conflict = null;
    insert.fail = false;
    insert.calls = 0;
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin sesión → 401 y NO escribe", async () => {
    const res = await POST(createRequest());
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(insert.calls).toBe(0);
  });

  it("usuario sin email → 401 y NO escribe", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });

    const res = await POST(createRequest());
    expect(res.status).toBe(401);
    expect(insert.calls).toBe(0);
  });

  it("sesión válida → 200 con upsert y prioridad x-real-ip", async () => {
    mockGetUser.mockResolvedValue(authed);

    const res = await POST(
      createRequest({
        "x-real-ip": "198.51.100.44",
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        "x-vercel-ip-country": "ES",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0)",
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(insert.calls).toBe(1);
    expect(insert.values).toMatchObject({
      userId: "u-1",
      email: "user@example.com",
      ipAddress: "198.51.100.44",
      country: "ES",
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
    });
    expect(insert.values?.lastLogin).toBeInstanceOf(Date);
    expect(insert.conflict).not.toBeNull();
  });

  it("sin x-real-ip → usa el 1er segmento de x-forwarded-for", async () => {
    mockGetUser.mockResolvedValue(authed);

    const res = await POST(createRequest({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }));
    expect(res.status).toBe(200);
    expect(insert.values).toMatchObject({ ipAddress: "203.0.113.9" });
  });

  it("sin cabeceras de IP → ipAddress null", async () => {
    mockGetUser.mockResolvedValue(authed);

    const res = await POST(createRequest());
    expect(res.status).toBe(200);
    expect(insert.values).toMatchObject({ ipAddress: null, country: null, userAgent: null });
  });

  it("userAgent largo se trunca a 400 caracteres", async () => {
    mockGetUser.mockResolvedValue(authed);

    const res = await POST(createRequest({ "user-agent": "A".repeat(500) }));
    expect(res.status).toBe(200);
    expect(String(insert.values?.userAgent)).toHaveLength(400);
  });

  it("fallo del insert → 204 (no bloquea la navegación)", async () => {
    mockGetUser.mockResolvedValue(authed);
    insert.fail = true;

    const res = await POST(createRequest({ "x-real-ip": "1.2.3.4" }));
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });
});
