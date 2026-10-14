/* ═══════════════════════════════════════════════════════════════════════════
   Adversary: Vulnerabilities PATCH — Tests de endpoint (Oleada 3 · P0.2)

   La ruta ya no usa `directDb`: todo corre dentro de `withRLS(user.id, tx)`.
   El mock de `withRLS` entrega una `tx` controlable (mismo patrón que
   soc2-pack/route.test.ts / push-subscribe/route.test.ts). Verifica:
   - 401 sin sesión (sin tocar la BD)
   - 400 con payload inválido
   - 404 cuando RLS acota la lectura a 0 filas (no-miembro)
   - 404 cuando la barrera de membresía (assertProjectAccess) deniega
   - 403 sin autorización de testing activa en el proyecto
   - 409 si ya hay una evaluación en curso
   - 200 triage (falsePositive) y 200 retest (inserta assessment + trigger)
   - 500 ante error de BD
   P0.2: la escritura/lectura corre bajo la autoridad del usuario autenticado.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  withRLS: vi.fn(),
  assertProjectAccess: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    mocks.withRLS(userId, cb);
    return cb(buildTx());
  },
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/request-context", () => ({
  withRequestContext: <T>(handler: T): T => handler,
  currentCorrelationId: () => "corr-test",
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: mocks.trigger },
}));

vi.mock("@/server/intelligence/adversary/assessment/assessment-service", () => ({
  executeAssessment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}));

vi.mock("@/shared/db/schemas", () => ({
  adversaryAssessments: { id: "id", projectId: "projectId", status: "status" },
  adversaryVulnerabilities: { id: "id", assessmentId: "assessmentId", falsePositive: "falsePositive" },
  projects: { id: "id", domain: "domain", activeTestingAuthorized: "activeTestingAuthorized" },
}));

// ─── tx controlable ──────────────────────────────────────────────────────────

/** Resultados de cada `tx.select(...)` await, en orden de llamada. */
let selectResults: unknown[][] = [];
const mockUpdateWhere = vi.fn();
const mockInsertReturning = vi.fn();
const mockFindFirst = vi.fn();

function buildTx() {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(selectResults.shift() ?? []).then(res, rej),
  };
  return {
    select: () => chain,
    update: () => ({ set: () => ({ where: mockUpdateWhere }) }),
    insert: () => ({ values: () => ({ returning: mockInsertReturning }) }),
    query: { projects: { findFirst: mockFindFirst } },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const VULN_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ASSESSMENT_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";

function patch(body: unknown): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/intelligence/adversary/vulnerabilities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function resetDefaults(): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.assertProjectAccess.mockResolvedValue({ ok: true, role: "owner" });
  mocks.trigger.mockResolvedValue({ id: "run-1" });
  mockFindFirst.mockResolvedValue({ id: PROJECT_ID, domain: "example.com", activeTestingAuthorized: true });
  mockUpdateWhere.mockResolvedValue(undefined);
  mockInsertReturning.mockResolvedValue([{ id: "new-assessment-id" }]);
  selectResults = [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Adversary: Vulnerabilities — PATCH", () => {
  let PATCH: typeof import("./route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    PATCH = mod.PATCH;
  });

  it("sin sesión → 401 sin tocar la BD", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(mocks.withRLS).not.toHaveBeenCalled();
  });

  it("payload inválido → 400", async () => {
    const res = await PATCH(patch({ vulnerabilityId: "not-a-uuid" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Payload inválido");
    expect(mocks.withRLS).not.toHaveBeenCalled();
  });

  it("vulnerabilidad de otro proyecto (RLS → 0 filas) → 404 sin evaluar membresía", async () => {
    selectResults = [[]];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Vulnerabilidad no encontrada");
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it("membresía denegada por la barrera explícita → 404", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
    ];
    mocks.assertProjectAccess.mockResolvedValue({ ok: false, role: null });

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("retest sin autorización de testing activa → 403", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
    ];
    mockFindFirst.mockResolvedValue({ id: PROJECT_ID, domain: "example.com", activeTestingAuthorized: false });

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, retest: true }) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Proyecto sin autorización activa");
  });

  it("retest con evaluación en curso → 409", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
      [{ id: "running-assessment" }],
    ];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, retest: true }) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Ya hay una evaluación en curso");
  });

  it("triage falsePositive → 200 (sin retest)", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
    ];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.retestAssessmentId).toBeNull();
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("retest válido → 200 con nuevo assessment y trigger disparado", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
      [], // sin evaluación running
    ];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, retest: true }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.retestAssessmentId).toBe("new-assessment-id");
    expect(mockInsertReturning).toHaveBeenCalledTimes(1);
    expect(mocks.trigger).toHaveBeenCalledWith(
      "adversary-real-assessment",
      expect.objectContaining({ assessmentId: "new-assessment-id", correlationId: "corr-test" }),
    );
  });

  it("P0.2: todas las operaciones corren bajo la autoridad del usuario autenticado", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
    ];

    await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);

    expect(mocks.withRLS).toHaveBeenCalledWith("user-1", expect.any(Function));
  });

  it("assessment huérfano → 404", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [],
    ];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Assessment no encontrado");
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it("triage y retest combinados → 200 (update + insert)", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
      [],
    ];

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: false, retest: true }) as never);
    expect(res.status).toBe(200);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    expect(mockInsertReturning).toHaveBeenCalledTimes(1);
  });

  it("Trigger.dev no disponible → fallback local y 200 igualmente", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
      [],
    ];
    mocks.trigger.mockRejectedValue(new Error("no token"));

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, retest: true }) as never);
    expect(res.status).toBe(200);

    const svc = await import("@/server/intelligence/adversary/assessment/assessment-service");
    await vi.waitFor(() =>
      expect(vi.mocked(svc.executeAssessment)).toHaveBeenCalledWith("new-assessment-id"),
    );
  });

  it("error de BD → 500", async () => {
    selectResults = [
      [{ id: VULN_ID, assessmentId: ASSESSMENT_ID }],
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID }],
    ];
    mockUpdateWhere.mockRejectedValue(new Error("db down"));

    const res = await PATCH(patch({ vulnerabilityId: VULN_ID, falsePositive: true }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
  });
});
