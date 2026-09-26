/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Adversary Vulnerabilities (PATCH) — Tests (TD-03 lote 2)

   Triage de falsos positivos + retest de assessments. Verifica:
   - 401 sin sesión; 400 payload inválido; 404 vuln/assessment/sin acceso
   - falsePositive booleano → update de triage
   - retest: 403 sin consentimiento, 409 con evaluación en curso,
     200 con nuevo assessmentId + Trigger.dev (y fallback local si falla)
   - error → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockProjFindFirst = vi.fn();
const mockAccess = vi.fn();
const mockTrigger = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    query: {
      projects: {
        findFirst: (...args: unknown[]) => mockProjFindFirst(...args),
      },
    },
  },
  db: {},
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAccess(...args),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTrigger(...args) },
}));

vi.mock("@/server/intelligence/adversary/assessment/assessment-service", () => ({
  executeAssessment: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Cadena thenable de Drizzle: from/where/limit encadenables. */
function chain(value: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) {
    c[m] = () => c;
  }
  c.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(value).then(resolve, reject);
  return c;
}

function patchRequest(body: unknown): Request {
  return new Request(
    "http://localhost:3000/api/intelligence/adversary/vulnerabilities",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const VULN_ID = "2a7cff00-0000-4000-8000-000000000010";
const vuln = { id: VULN_ID, assessmentId: "as-1" };
const assessment = { id: "as-1", projectId: "p1" };
const authorizedProject = {
  id: "p1",
  domain: "example.com",
  activeTestingAuthorized: true,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Adversary Vulnerabilities — PATCH", () => {
  let PATCH: typeof import("./route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => chain([]));
    mockUser = { id: "u-1" };
    mockAccess.mockResolvedValue({ ok: true });
    mockProjFindFirst.mockResolvedValue(authorizedProject);
    mockUpdate.mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    });
    mockInsert.mockReturnValue({
      values: () => ({
        returning: async () => [{ id: "re-1" }],
      }),
    });
    mockTrigger.mockResolvedValue({ id: "run-1" });
    const mod = await import("./route");
    PATCH = mod.PATCH;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID }) as never,
    );
    expect(res.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("payload inválido (id no UUID) → 400", async () => {
    const res = await PATCH(
      patchRequest({ vulnerabilityId: "no-uuid", falsePositive: true }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Payload inválido");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("vulnerabilidad inexistente → 404", async () => {
    mockSelect.mockImplementationOnce(() => chain([]));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID }) as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Vulnerabilidad no encontrada");
  });

  it("assessment huérfano → 404", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([]));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID }) as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Assessment no encontrado");
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it("sin acceso al proyecto → 404", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]));
    mockAccess.mockResolvedValue({ ok: false });

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID }) as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("triage falsePositive → update y 200 sin retest", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID, falsePositive: true }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ success: true, retestAssessmentId: null });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("retest sin consentimiento activo → 403", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]));
    mockProjFindFirst.mockResolvedValue({
      ...authorizedProject,
      activeTestingAuthorized: false,
    });

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID, retest: true }) as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Proyecto sin autorización activa");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("retest con evaluación en curso → 409", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]))
      .mockImplementationOnce(() => chain([{ id: "as-running" }]));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID, retest: true }) as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Ya hay una evaluación en curso");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("retest ok → 200 con nuevo assessmentId y trigger lanzado", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]))
      .mockImplementationOnce(() => chain([]));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID, retest: true }) as never,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ success: true, retestAssessmentId: "re-1" });
    expect(mockTrigger).toHaveBeenCalledWith("adversary-real-assessment", {
      assessmentId: "re-1",
    });
  });

  it("triage y retest combinados en la misma petición", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]))
      .mockImplementationOnce(() => chain([]));

    const res = await PATCH(
      patchRequest({
        vulnerabilityId: VULN_ID,
        falsePositive: false,
        retest: true,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("Trigger.dev no disponible → fallback local y 200 igualmente", async () => {
    mockSelect
      .mockImplementationOnce(() => chain([vuln]))
      .mockImplementationOnce(() => chain([assessment]))
      .mockImplementationOnce(() => chain([]));
    mockTrigger.mockRejectedValue(new Error("no token"));

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID, retest: true }) as never,
    );
    expect(res.status).toBe(200);

    const svc = await import(
      "@/server/intelligence/adversary/assessment/assessment-service"
    );
    await vi.waitFor(() =>
      expect(vi.mocked(svc.executeAssessment)).toHaveBeenCalledWith("re-1"),
    );
  });

  it("error de BD → 500", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await PATCH(
      patchRequest({ vulnerabilityId: VULN_ID }) as never,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
  });
});
