/* ═══════════════════════════════════════════════════════════════════════════
   Export — Tests de endpoint (TD-03 lote 3)

   Exportación masiva de datos de proyecto en JSON o CSV bajo RLS. Verifica:
   - 401 sin sesión; 400 sin projectId / formato inválido / recurso inválido
   - 200 JSON con count y fechas convertidas a ISO
   - 200 CSV con cabeceras, escaping de comillas y Content-Disposition
   - Casos borde: recurso sin filas → count 0 (JSON) y "No data" (CSV)
   - Error de BD → 500 con INTERNAL_ERROR
   - TD-13: paginación keyset en lotes de 1000 (JSON completo sin materializar)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthError } from "@/server/lib/app-error";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetCurrentUserOrThrow = vi.fn();
const mockWithRLS = vi.fn();

const mockFindings = vi.fn();
const mockAssets = vi.fn();
const mockToolRuns = vi.fn();
const mockAuditLogs = vi.fn();

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: (...args: unknown[]) => mockGetCurrentUserOrThrow(...args),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (...args: unknown[]) => mockWithRLS(...args),
}));

// withErrorHandler persiste errores vía el logger de dominio: debe devolver
// una promesa para que handleApiError pueda encadenar .catch().
vi.mock("@/shared/lib/logger", () => ({
  logger: {
    log: vi.fn(() => Promise.resolve()),
    security: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
  },
}));

const testState = { rowCount: 0 };

const mockTx = {
  query: {
    intelligenceFindings: { findMany: (...args: unknown[]) => mockFindings(...args) },
    intelligenceAssets: { findMany: (...args: unknown[]) => mockAssets(...args) },
    intelligenceToolRuns: { findMany: (...args: unknown[]) => mockToolRuns(...args) },
    auditLogs: { findMany: (...args: unknown[]) => mockAuditLogs(...args) },
  },
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ n: testState.rowCount }]),
    })),
  })),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/export${query}`, { method: "GET" }),
  );
}

const findingRow = {
  id: "f1",
  investigationId: "inv-1",
  severity: "critical",
  confidence: "high",
  title: "SQL injection",
  description: "Unquoted, with, commas",
  recommendation: 'He said "hi"',
  affectedAsset: "api.example.com",
  createdAt: new Date("2026-09-26T10:00:00.000Z"),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Export — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    testState.rowCount = 0;
    mockGetCurrentUserOrThrow.mockResolvedValue({ id: "u-1" });
    mockWithRLS.mockImplementation(
      (_userId: unknown, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
    );
    mockFindings.mockResolvedValue([]);
    mockAssets.mockResolvedValue([]);
    mockToolRuns.mockResolvedValue([]);
    mockAuditLogs.mockResolvedValue([]);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetCurrentUserOrThrow.mockRejectedValue(new AuthError());

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("sin projectId → 400", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Falta projectId");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("formato inválido → 400", async () => {
    const res = await GET(createRequest("?projectId=p1&format=xml"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Formato inválido. Usa 'csv' o 'json'");
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("recurso inválido → 400", async () => {
    const res = await GET(createRequest("?projectId=p1&resource=secrets"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "Recurso inválido. Usa 'findings', 'assets', 'toolruns' o 'auditlogs'",
    );
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("findings json → 200 con count y fechas ISO", async () => {
    testState.rowCount = 1;
    mockFindings.mockResolvedValue([findingRow]);

    const res = await GET(createRequest("?projectId=p1&format=json&resource=findings"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resource).toBe("findings");
    expect(body.projectId).toBe("p1");
    expect(body.count).toBe(1);
    expect(body.data[0].id).toBe("f1");
    expect(body.data[0].createdAt).toBe("2026-09-26T10:00:00.000Z");
    expect(mockWithRLS).toHaveBeenCalledWith("u-1", expect.any(Function));
    expect(mockFindings).toHaveBeenCalledTimes(1);
    expect(mockAssets).not.toHaveBeenCalled();
  });

  it("assets json → 200 con fechas ISO y nulos conservados", async () => {
    testState.rowCount = 1;
    mockAssets.mockResolvedValue([
      {
        id: "a1",
        assetType: "domain",
        value: "example.com",
        ip: null,
        firstSeenAt: new Date("2026-09-01T00:00:00.000Z"),
        lastSeenAt: undefined,
      },
    ]);

    const res = await GET(createRequest("?projectId=p1&resource=assets"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.data[0].value).toBe("example.com");
    expect(body.data[0].ip).toBeNull();
    expect(body.data[0].firstSeenAt).toBe("2026-09-01T00:00:00.000Z");
    expect("lastSeenAt" in body.data[0]).toBe(false);
    expect(mockFindings).not.toHaveBeenCalled();
    expect(mockAssets).toHaveBeenCalledTimes(1);
  });

  it("csv con datos → 200 con cabeceras y escaping", async () => {
    mockFindings.mockResolvedValue([findingRow]);

    const res = await GET(createRequest("?projectId=p1&format=csv&resource=findings"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="findings-p1.csv"',
    );

    const text = await res.text();
    const lines = text.split("\n");
    expect(lines[0]).toBe(
      "id,investigationId,severity,confidence,title,description,recommendation,affectedAsset,createdAt",
    );
    expect(text).toContain('"Unquoted, with, commas"');
    expect(text).toContain('"He said ""hi"""');
    expect(text).toContain("f1,inv-1,critical,high");
  });

  it("csv sin datos → 200 con cuerpo 'No data'", async () => {
    mockFindings.mockResolvedValue([]);

    const res = await GET(createRequest("?projectId=p1&format=csv&resource=findings"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(await res.text()).toBe("No data");
    expect(mockFindings).toHaveBeenCalledTimes(1);
  });

  it("auditlogs sin filas → 200 con count 0", async () => {
    const res = await GET(createRequest("?projectId=p1&resource=auditlogs"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resource).toBe("auditlogs");
    expect(body.count).toBe(0);
    expect(body.data).toEqual([]);
    expect(mockAuditLogs).toHaveBeenCalledTimes(1);
    expect(mockFindings).not.toHaveBeenCalled();
  });

  it("error de BD → 500 con INTERNAL_ERROR", async () => {
    mockWithRLS.mockRejectedValue(new Error("db down"));

    const res = await GET(createRequest("?projectId=p1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("TD-13: lotes keyset — 1001 filas en 2 batches sin materializar el recurso", async () => {
    testState.rowCount = 1001;
    const batch1 = Array.from({ length: 1000 }, (_, i) => ({
      ...findingRow,
      id: `f${i}`,
    }));
    mockFindings
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce([{ ...findingRow, id: "f1000" }]);

    const res = await GET(createRequest("?projectId=p1&format=json&resource=findings"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1001);
    expect(body.data).toHaveLength(1001);
    expect(body.data[0].id).toBe("f0");
    expect(body.data[1000].id).toBe("f1000");
    expect(mockFindings).toHaveBeenCalledTimes(2);
    // count + lote 1 + lote 2, cada uno en su propia transacción RLS
    expect(mockWithRLS).toHaveBeenCalledTimes(3);
  });
});
