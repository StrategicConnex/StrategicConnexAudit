import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  requireProjectPermission: vi.fn(),
  suppressFinding: vi.fn(),
  getFindingScope: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/server/intelligence/findings/workflow", () => ({
  suppressFinding: mocks.suppressFinding,
  getFindingScope: mocks.getFindingScope,
}));

function post(body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/intelligence/findings/x/suppress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const FINDING_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ctx = { params: Promise.resolve({ id: FINDING_ID }) };

describe("Finding suppress — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
    mocks.getFindingScope.mockResolvedValue({ id: FINDING_ID, projectId: PROJECT_ID, status: "open" });
  });

  it("supresión válida → 200 con suppressedUntil", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.suppressFinding.mockResolvedValue({
      ok: true,
      suppressedUntil: "2026-11-01T00:00:00.000Z",
    });

    const res = await POST(
      post({ projectId: PROJECT_ID, reason: "falso positivo recurrente", hours: 168 }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suppressedUntil).toBeTruthy();
  });

  it("motivo demasiado corto → 400", async () => {
    const res = await POST(post({ projectId: PROJECT_ID, reason: "x" }), ctx);
    expect(res.status).toBe(400);
  });

  it("hallazgo de otro proyecto → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.getFindingScope.mockResolvedValue({
      id: FINDING_ID,
      projectId: "999e4567-e89b-12d3-a456-426614174999",
      status: "open",
    });
    const res = await POST(post({ projectId: PROJECT_ID, reason: "ruido conocido" }), ctx);
    expect(res.status).toBe(404);
  });

  it("sin permiso → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");
    const res = await POST(post({ projectId: PROJECT_ID, reason: "ruido conocido" }), ctx);
    expect(res.status).toBe(403);
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await POST(post({ projectId: PROJECT_ID, reason: "ruido conocido" }), ctx);
    expect(res.status).toBe(500);
  });
});
