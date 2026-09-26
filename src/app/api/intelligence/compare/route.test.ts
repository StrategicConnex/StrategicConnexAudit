/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Compare — Tests de endpoint (TD-03 lote 2)

   withErrorHandler REAL (ValidationError→400, NotFoundError→404); auth y
   withRLS mockeados. Verifica:
   - Params ausentes → 400; misma investigación → 400
   - Investigación inexistente → 404
   - Diff correcto: scoreDelta, newInB/resolvedSinceA/unchanged (clave=title)
     y toolsDiff (newTools/removedTools); score null → scoreDelta null
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockInvFindFirst = vi.fn();
const mockFindingsFindMany = vi.fn();
const mockToolsFindMany = vi.fn();

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: async () => ({ id: "u-1" }),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: {
        intelligenceInvestigations: {
          findFirst: (...args: unknown[]) => mockInvFindFirst(...args),
        },
        intelligenceFindings: {
          findMany: (...args: unknown[]) => mockFindingsFindMany(...args),
        },
        intelligenceToolRuns: {
          findMany: (...args: unknown[]) => mockToolsFindMany(...args),
        },
      },
    }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRequest(params: string): Request {
  return new Request(`http://localhost:3000/api/intelligence/compare?${params}`);
}

const invA = {
  id: "inv-a",
  title: "Auditoría inicial",
  target: "example.com",
  score: 60,
  completedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const invB = {
  id: "inv-b",
  title: "Auditoría relanzada",
  target: "example.com",
  score: 75,
  completedAt: new Date("2026-02-01T00:00:00.000Z"),
};

const findingsA = [
  { title: "TLS 1.0 habilitado", severity: "high", affectedAsset: "example.com" },
  { title: "SPF ausente", severity: "medium", affectedAsset: null },
];

const findingsB = [
  { title: "TLS 1.0 habilitado", severity: "critical", affectedAsset: "example.com" },
  { title: "Puerto 22 expuesto", severity: "high", affectedAsset: "203.0.113.5" },
];

const toolsA = [{ toolId: "nmap" }, { toolId: "dns-enumeration" }];
const toolsB = [{ toolId: "nmap" }, { toolId: "crtsh" }];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Compare — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Orden: findFirst(A), findFirst(B); findMany(A), findMany(B); tools A, B
    mockInvFindFirst
      .mockResolvedValueOnce(invA)
      .mockResolvedValueOnce(invB);
    mockFindingsFindMany
      .mockResolvedValueOnce(findingsA)
      .mockResolvedValueOnce(findingsB);
    mockToolsFindMany
      .mockResolvedValueOnce(toolsA)
      .mockResolvedValueOnce(toolsB);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin investigationA/B → 400 ValidationError", async () => {
    const res = await GET(getRequest("investigationA=only") as never);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Se requieren investigationA e investigationB");
    expect(mockInvFindFirst).not.toHaveBeenCalled();
  });

  it("mismo id en A y B → 400", async () => {
    const res = await GET(
      getRequest("investigationA=inv-x&investigationB=inv-x") as never,
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Las investigaciones deben ser diferentes");
  });

  it("investigación A inexistente → 404 NotFoundError", async () => {
    mockInvFindFirst
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(invB);

    const res = await GET(
      getRequest("investigationA=nope&investigationB=inv-b") as never,
    );
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockFindingsFindMany).not.toHaveBeenCalled();
  });

  it("200 con scoreDelta, findingsDiff y toolsDiff correctos", async () => {
    const res = await GET(
      getRequest("investigationA=inv-a&investigationB=inv-b") as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    expect(body.investigationA).toEqual({
      id: "inv-a",
      title: "Auditoría inicial",
      target: "example.com",
      score: 60,
      completedAt: "2026-01-01T00:00:00.000Z",
      findingsCount: 2,
    });
    expect(body.investigationB.completedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(body.scoreDelta).toBe(15); // 75 - 60

    expect(body.findingsDiff.totalA).toBe(2);
    expect(body.findingsDiff.totalB).toBe(2);
    expect(body.findingsDiff.newInB).toEqual([
      { title: "Puerto 22 expuesto", severity: "high", status: "new", affectedAsset: "203.0.113.5" },
    ]);
    expect(body.findingsDiff.resolvedSinceA).toEqual([
      { title: "SPF ausente", severity: "medium", status: "resolved", affectedAsset: null },
    ]);
    expect(body.findingsDiff.unchanged).toEqual([
      { title: "TLS 1.0 habilitado", severity: "critical", status: "unchanged", affectedAsset: "example.com" },
    ]);

    expect(body.toolsDiff.toolsUsedA.sort()).toEqual(["dns-enumeration", "nmap"]);
    expect(body.toolsDiff.toolsUsedB.sort()).toEqual(["crtsh", "nmap"]);
    expect(body.toolsDiff.newTools).toEqual(["crtsh"]);
    expect(body.toolsDiff.removedTools).toEqual(["dns-enumeration"]);
  });

  it("score null en A → scoreDelta null", async () => {
    mockInvFindFirst.mockReset().mockResolvedValueOnce({
      ...invA,
      score: null,
      completedAt: null,
    }).mockResolvedValueOnce(invB);

    const res = await GET(
      getRequest("investigationA=inv-a&investigationB=inv-b") as never,
    );
    const body = await res.json();
    expect(body.scoreDelta).toBeNull();
    expect(body.investigationA.completedAt).toBeNull();
  });

  it("error inesperado en withRLS → 500", async () => {
    mockFindingsFindMany.mockReset().mockRejectedValue(new Error("db down"));

    const res = await GET(
      getRequest("investigationA=inv-a&investigationB=inv-b") as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
