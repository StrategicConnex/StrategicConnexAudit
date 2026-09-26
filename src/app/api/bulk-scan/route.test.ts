/* ═══════════════════════════════════════════════════════════════════════════
   Bulk Scan — Tests de endpoint (TD-03 lote 3)

   Encola escaneos masivos con rate limit (authenticate) + RLS. Verifica:
   - 401 sin sesión (authenticate → null)
   - 400 en validación zod: uuid, lista vacía y >10 targets
   - 404 si el proyecto no existe; 500 si el insert falla
   - 200 con targetType inferido (domain/email/url), normalización y fetch
   - Caso borde: targets en blanco se omiten (0 en cola)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
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
      query: { projects: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
      insert: (...args: unknown[]) => mockInsert(...args),
    }),
}));

vi.stubGlobal("fetch", mockFetch);

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

type InsertedRow = {
  projectId: string;
  ownerId: string;
  title: string;
  target: string;
  normalizedTarget: string;
  targetType: string;
  status: string;
};

const insertedRows: InsertedRow[] = [];
let insertSeq = 0;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Bulk Scan — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    insertedRows.length = 0;
    insertSeq = 0;
    mockFindFirst.mockResolvedValue({ id: PROJECT_ID });
    mockInsert.mockImplementation(() => ({
      values: (rows: InsertedRow) => {
        insertedRows.push(rows);
        return {
          returning: () => {
            insertSeq += 1;
            return Promise.resolve([
              {
                id: `inv-${insertSeq}`,
                target: rows.target,
                status: rows.status,
                createdAt: new Date("2026-09-26T10:00:00.000Z"),
              },
            ]);
          },
        };
      },
    }));
    mockFetch.mockResolvedValue({ ok: true });
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("projectId que no es uuid → 400", async () => {
    const res = await POST(createRequest({ projectId: "not-a-uuid", targets: ["a.com"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Argumentos inválidos");
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("targets vacíos → 400", async () => {
    const res = await POST(createRequest({ projectId: PROJECT_ID, targets: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Argumentos inválidos");
  });

  it("11 targets → 400 por el límite de 10", async () => {
    const res = await POST(
      createRequest({
        projectId: PROJECT_ID,
        targets: Array.from({ length: 11 }, (_, i) => `t${i}.com`),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("proyecto no encontrado → 404", async () => {
    mockFindFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("200 con targets encolados, targetType inferido y fetch disparado", async () => {
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("3 escaneos en cola con éxito.");
    expect(body.queued).toHaveLength(3);
    expect(body.queued.map((q: { status: string }) => q.status)).toEqual([
      "running",
      "running",
      "running",
    ]);
    expect(body.queued[0].createdAt).toBe("2026-09-26T10:00:00.000Z");

    expect(insertedRows.map((r) => r.target)).toEqual([
      "example.com",
      "user@host.io",
      "https://a.example",
    ]);
    expect(insertedRows.map((r) => r.targetType)).toEqual(["domain", "email", "url"]);
    expect(insertedRows.every((r) => r.ownerId === "u-1")).toBe(true);
    expect(insertedRows.every((r) => r.projectId === PROJECT_ID)).toBe(true);
    expect(insertedRows.every((r) => r.title.startsWith("Escaneo Masivo:"))).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("http://localhost:3000/api/intelligence");
  });

  it("targets en blanco se omiten → 0 en cola", async () => {
    const res = await POST(createRequest({ projectId: PROJECT_ID, targets: ["   "] }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("0 escaneos en cola con éxito.");
    expect(body.queued).toEqual([]);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fallo en el insert → 500", async () => {
    mockInsert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error("insert failed")),
      }),
    }));

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
  });
});
