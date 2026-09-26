/* ================================================================
   Projects/[id]/export/keywords — Tests de endpoint (TD-03 lote 3)

   GET que exporta el CSV de rankings de keywords del proyecto.
   Verifica:
   - 401 sin sesión; 404 sin acceso al proyecto (assertProjectAccess)
   - 200 CSV con cabecera, filas entrecomilladas y filename con fecha
   - Sin targets → solo la línea de cabeceras (keywords-<id>.csv)
   - Target sin rank → Position "N/A" y Search Volume 0
   - Escapado de comillas dobles en los valores
   - 500 si withRLS falla (error de BD)
   ================================================================ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { keywordTargets } from "@/shared/db/schemas";

// ==== Mocks ====

const mockGetUser = vi.fn();
const mockAssertProjectAccess = vi.fn(
  async (_u: string, _p: string): Promise<{ ok: boolean; role: string | null }> => ({
    ok: true,
    role: "owner",
  })
);
const mockWithRLS = vi.fn(
  async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)
);

const db = {
  targets: [] as Array<Record<string, unknown>>,
  ranks: [] as Array<Record<string, unknown>>,
};

const mockTx = {
  select: vi.fn(() => ({
    from: vi.fn((table: unknown) => {
      if (table === keywordTargets) {
        return { where: vi.fn(async () => db.targets) };
      }
      return {
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => db.ranks),
          })),
        })),
      };
    }),
  })),
};

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (userId: string, projectId: string) =>
    mockAssertProjectAccess(userId, projectId),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    mockWithRLS(userId, cb),
}));

// ==== Helpers ====

const authed = { data: { user: { id: "u-1" } } };

function req(url: string) {
  return new Request(url) as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: "p1" }) };

const CSV_HEADERS =
  "Keyword,Location,Device,Position,Search Volume,Last Checked,Target URL";

describe("projects/[id]/export/keywords API — GET CSV de rankings", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(authed);
    mockAssertProjectAccess.mockResolvedValue({ ok: true, role: "owner" });
    db.targets = [];
    db.ranks = [];
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(401);
    expect(mockAssertProjectAccess).not.toHaveBeenCalled();
  });

  it("sin acceso al proyecto → 404", async () => {
    mockAssertProjectAccess.mockResolvedValueOnce({ ok: false, role: null });
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(404);
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("con targets y ranks → 200 CSV con filas", async () => {
    const checkedAt = new Date("2026-01-02T03:04:05.000Z");
    db.targets = [
      {
        id: "k1",
        keyword: "seo audit",
        location: "es",
        device: "mobile",
        targetUrl: "https://x.com/services",
      },
    ];
    db.ranks = [{ position: 3, searchVolume: 100, checkedAt }];
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("keywords-ranking-");
    const body = await res.text();
    expect(body).toContain(CSV_HEADERS);
    expect(body).toContain(
      `"seo audit","es","mobile","3","100","${String(checkedAt)}","https://x.com/services"`
    );
    expect(mockAssertProjectAccess).toHaveBeenCalledWith("u-1", "p1");
    expect(mockWithRLS).toHaveBeenCalledWith("u-1", expect.any(Function));
  });

  it("sin targets → 200 solo cabeceras", async () => {
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain('filename="keywords-p1.csv"');
    const body = await res.text();
    expect(body).toBe(`${CSV_HEADERS}\n`);
  });

  it("target sin rank → Position N/A y volumen 0", async () => {
    db.targets = [
      { id: "k1", keyword: "brand", location: null, device: null, targetUrl: null },
    ];
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`"brand","N/A","desktop","N/A","0","N/A","N/A"`);
  });

  it("escapa comillas y comas del keyword", async () => {
    db.targets = [{ id: "k1", keyword: 'seo, "audit"', location: "", device: "", targetUrl: "" }];
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`"seo, ""audit"""`);
  });

  it("withRLS falla → 500", async () => {
    mockWithRLS.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("http://x/api/projects/p1/export/keywords"), params);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal Server Error");
  });
});
