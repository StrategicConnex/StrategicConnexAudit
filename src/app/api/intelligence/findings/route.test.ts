import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  requireProjectPermission: vi.fn(),
  listFindingsForBoard: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/server/intelligence/findings/workflow", () => ({
  listFindingsForBoard: mocks.listFindingsForBoard,
  FINDING_TRANSITIONS: {
    open: ["acknowledged"],
    acknowledged: ["open", "in_progress"],
    in_progress: ["acknowledged", "resolved", "false_positive", "accepted_risk"],
    resolved: [],
    false_positive: [],
    accepted_risk: [],
  },
  FINDING_STATUSES: [
    "open",
    "acknowledged",
    "in_progress",
    "resolved",
    "false_positive",
    "accepted_risk",
  ],
}));

function get(url: string): NextRequest {
  return new NextRequest(new Request(url));
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const boardRow = {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectId: PROJECT_ID,
  title: "XSS reflejado",
  description: "Detalle",
  severity: "high",
  status: "open",
  assigneeId: null,
  slaHours: null,
  dueAt: null,
  acknowledgedAt: null,
  resolvedAt: null,
  suppressedUntil: null,
  suppressedReason: null,
  affectedAsset: null,
  aiTriage: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  overdue: false,
};

describe("Intelligence findings — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("200 con hallazgos y estados canónicos", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.listFindingsForBoard.mockResolvedValue([boardRow]);

    const res = await GET(
      get(`http://localhost:3000/api/intelligence/findings?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.findings).toHaveLength(1);
    expect(body.statuses).toContain("accepted_risk");
  });

  it("sin projectId → 400", async () => {
    const res = await GET(get("http://localhost:3000/api/intelligence/findings"));
    expect(res.status).toBe(400);
  });

  it("projectId no UUID → 400", async () => {
    const res = await GET(
      get("http://localhost:3000/api/intelligence/findings?projectId=nope"),
    );
    expect(res.status).toBe(400);
  });

  it("estado inválido → 400", async () => {
    const res = await GET(
      get(
        `http://localhost:3000/api/intelligence/findings?projectId=${PROJECT_ID}&status=nope`,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("proyecto no encontrado → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");
    const res = await GET(
      get(`http://localhost:3000/api/intelligence/findings?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(404);
  });

  it("sin permiso report:view → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");
    const res = await GET(
      get(`http://localhost:3000/api/intelligence/findings?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(403);
  });

  it("sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(
      get(`http://localhost:3000/api/intelligence/findings?projectId=${PROJECT_ID}`),
    );
    expect(res.status).toBe(500);
  });
});
