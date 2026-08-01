/* ═══════════════════════════════════════════════════════════════════════════
   Adversary API — Tests de endpoint (PATCH report)
   
   Verifica el flujo de reporte de resultados de simulación:
   - Autenticación (401 sin usuario)
   - Validación de body (400: runId/result faltantes, result inválido)
   - PATCH exitoso → 200 y db.update con { result, detectedBy, completedAt }
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();

const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    updateCalls: [] as Array<{ table: unknown; values: unknown; where: unknown }>,
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async (where: unknown) => {
          dbMock.updateCalls.push({ table, values, where });
        }),
      })),
    })),
  };
  return { dbMock };
});

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/db", () => ({
  db: dbMock,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, body?: any): NextRequest {
  const url = `http://localhost:3000/api/intelligence/adversary`;
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Adversary API — PATCH report", () => {
  let PATCH: typeof import("./route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock.updateCalls = [];
    const mod = await import("./route");
    PATCH = mod.PATCH;
  });

  it("PATCH sin auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      createRequest("PATCH", { runId: "run-1", result: "detected" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("No autorizado");
  });

  it("PATCH sin runId → 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await PATCH(createRequest("PATCH", { result: "detected" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("runId y result son requeridos");
  });

  it("PATCH sin result → 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await PATCH(createRequest("PATCH", { runId: "run-1" }));
    expect(res.status).toBe(400);
  });

  it("PATCH con result inválido → 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await PATCH(
      createRequest("PATCH", { runId: "run-1", result: "maybe" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("result debe ser");
  });

  it("PATCH válido (detected + detectedBy) → 200 y update correcto", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await PATCH(
      createRequest("PATCH", { runId: "run-1", result: "detected", detectedBy: "EDR" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(dbMock.updateCalls).toHaveLength(1);
    const { values, where } = dbMock.updateCalls[0];
    expect(values).toMatchObject({ result: "detected", detectedBy: "EDR" });
    expect((values as { completedAt?: Date }).completedAt).toBeInstanceOf(Date);
    expect(where).toBeDefined();
  });

  it("PATCH válido sin detectedBy → se persiste null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await PATCH(
      createRequest("PATCH", { runId: "run-1", result: "missed" })
    );
    expect(res.status).toBe(200);
    expect(dbMock.updateCalls).toHaveLength(1);
    expect(dbMock.updateCalls[0].values).toMatchObject({
      result: "missed",
      detectedBy: null,
    });
  });
});
