/* ═══════════════════════════════════════════════════════════════════════════
   Remediation — Tests de endpoint

   Verifica los handlers GET/POST/PUT con permisos simulados:
   - GET: listado de acciones por projectId, validación de permisos
   - POST: propuesta de acción, validación de body, permisos
   - PUT: approve/execute, validación de operación
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCurrentUserOrThrow: vi.fn(),
  requireProjectPermission: vi.fn(),
  listActions: vi.fn(),
  proposeAction: vi.fn(),
  approveAction: vi.fn(),
  executeAction: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mocks.getCurrentUserOrThrow,
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/server/lib/remediation/service", () => ({
  listActions: mocks.listActions,
  proposeAction: mocks.proposeAction,
  approveAction: mocks.approveAction,
  executeAction: mocks.executeAction,
}));

vi.mock("@/server/lib/remediation/connectors", () => ({
  CONNECTORS: [
    { id: "cloudflare.purge_cache", label: "Cloudflare Cache", description: "Purge", fields: [] },
    { id: "github.create_issue", label: "GitHub Issue", description: "Create", fields: [] },
  ],
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ACTION_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const actionRow = {
  id: ACTION_ID,
  projectId: PROJECT_ID,
  title: "Purgar caché Cloudflare",
  connector: "cloudflare.purge_cache",
  status: "proposed",
  steps: ["Pasar a modo mantenimiento", "Ejecutar purge"],
  result: null,
  vulnerabilityTitle: "Caché obsoleta",
  createdAt: new Date(),
};

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("Remediation — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("GET con projectId válido y permiso → 200", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.listActions.mockResolvedValue([actionRow]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/remediation?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.actions).toHaveLength(1);
    expect(body.connectors).toBeDefined();
  });

  it("GET sin projectId → 400", async () => {
    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/remediation")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("GET projectId no UUID → 400", async () => {
    const res = await GET(
      createRequest("GET", "http://localhost:3000/api/remediation?projectId=bad")
    );
    expect(res.status).toBe(400);
  });

  it("GET proyecto no encontrado → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/remediation?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(404);
  });

  it("GET sin permiso report:view → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/remediation?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(403);
  });

  it("GET lista vacía → 200 con actions vacío", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.listActions.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/remediation?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toEqual([]);
  });

  it("GET sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));

    const res = await GET(
      createRequest("GET", `http://localhost:3000/api/remediation?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(500);
  });
});

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("Remediation — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  const validBody = {
    projectId: PROJECT_ID,
    title: "Purgar caché de Cloudflare",
    connector: "cloudflare.purge_cache",
    config: { apiToken: "tok_xxx", zoneId: "zone123" },
  };

  it("POST con body válido → 200 con id", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.proposeAction.mockResolvedValue(ACTION_ID);

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", validBody)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe(ACTION_ID);
  });

  it("POST body inválido (falta connector) → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", {
        projectId: PROJECT_ID,
        title: "Test",
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST connector desconocido → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", {
        ...validBody,
        connector: "unknown.connector",
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST sin permiso scan:execute → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", validBody)
    );
    expect(res.status).toBe(403);
  });

  it("POST proyecto no encontrado → 404", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", validBody)
    );
    expect(res.status).toBe(404);
  });

  it("POST body vacío → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", {})
    );
    expect(res.status).toBe(400);
  });

  it("POST sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));

    const res = await POST(
      createRequest("POST", "http://localhost:3000/api/remediation", validBody)
    );
    expect(res.status).toBe(500);
  });
});

// ─── Tests: PUT ──────────────────────────────────────────────────────────────

describe("Remediation — PUT", () => {
  let PUT: typeof import("./route").PUT;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    PUT = mod.PUT;
    mocks.getCurrentUserOrThrow.mockResolvedValue({ id: "user-1" });
  });

  it("PUT approve → 200 con status approved", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.approveAction.mockResolvedValue(undefined);

    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: ACTION_ID,
        op: "approve",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("approved");
  });

  it("PUT execute → 200 con result", async () => {
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.executeAction.mockResolvedValue({ ok: true });

    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: ACTION_ID,
        op: "execute",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("verified");
  });

  it("PUT body inválido (op desconocido) → 400", async () => {
    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: ACTION_ID,
        op: "delete",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(400);
  });

  it("PUT sin permiso project:update → 403", async () => {
    mocks.requireProjectPermission.mockResolvedValue("No tienes permiso para esta acción");

    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: ACTION_ID,
        op: "approve",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(403);
  });

  it("PUT body vacío → 400", async () => {
    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {})
    );
    expect(res.status).toBe(400);
  });

  it("PUT sin autenticación → 500", async () => {
    mocks.getCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));

    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: ACTION_ID,
        op: "approve",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(500);
  });

  it("PUT id no UUID → 400", async () => {
    const res = await PUT(
      createRequest("PUT", "http://localhost:3000/api/remediation", {
        id: "not-a-uuid",
        op: "approve",
        projectId: PROJECT_ID,
      })
    );
    expect(res.status).toBe(400);
  });
});
