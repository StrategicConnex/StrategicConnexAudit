/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Adversary MITRE — Tests de endpoint (TD-03 lote 2)

   POST lanza batch de evaluación MITRE / GET lista o detalla evaluaciones.
   Verifica la doble barrera (ownership + consentimiento activo):
   - 401 sin sesión; 400 payload/projectId inválidos; 404 sin ownership
   - 403 sin active_testing_authorized; 400 dominio inválido; 409 batch
     concurrente; 200 ok con Trigger.dev (y fallback local si falla)
   - GET: 200 listado, 200 detalle con results, 404 evaluación inexistente
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockFindFirst = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockTrigger = vi.fn();
const mockExtract = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      projects: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  directDb: {},
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTrigger(...args) },
}));

vi.mock("@/trigger/mitre-evaluation.trigger", () => ({
  runMitreEvaluationTask: {},
}));

vi.mock("@/server/intelligence/adversary/sandbox-executor", () => ({
  extractTargetHost: (...args: unknown[]) => mockExtract(...args),
}));

vi.mock("@/server/intelligence/adversary/mitre-eval/mitre-service", () => ({
  executeMitreEvaluation: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Cadena thenable de Drizzle: from/where/orderBy/limit encadenables. */
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

function getRequest(params = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/adversary/mitre${params}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/intelligence/adversary/mitre", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PROJECT_ID = "2a7cff00-0000-4000-8000-000000000001";
const ownedProject = {
  id: PROJECT_ID,
  domain: "example.com",
  activeTestingAuthorized: true,
};
const evaluation = { id: "e-1", status: "pending", projectId: PROJECT_ID };
const techniqueResults = [{ id: "r1", mitreId: "T1595" }];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Adversary MITRE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => chain([]));
    mockUser = { id: "u-1" };
    mockFindFirst.mockResolvedValue(ownedProject);
    mockExtract.mockReturnValue("example.com");
    mockTrigger.mockResolvedValue({ id: "run-1" });
    mockInsert.mockReturnValue({
      values: () => ({ returning: async () => [evaluation] }),
    });
  });

  describe("POST (lanzar evaluación)", () => {
    let POST: typeof import("./route").POST;

    beforeEach(async () => {
      const mod = await import("./route");
      POST = mod.POST;
    });

    it("sin sesión → 401", async () => {
      mockUser = null;

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(401);
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("payload sin projectId UUID → 400", async () => {
      const res = await POST(postRequest({ projectId: "no-uuid" }) as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("projectId inválido");
    });

    it("proyecto no propio → 404", async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(404);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("sin consentimiento activo → 403", async () => {
      mockFindFirst.mockResolvedValue({
        ...ownedProject,
        activeTestingAuthorized: false,
      });

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe(
        "Este proyecto no tiene autorización de evaluación activa.",
      );
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("dominio sin host extraíble → 400", async () => {
      mockExtract.mockReturnValue(null);

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("El proyecto no tiene dominio válido");
    });

    it("ya hay evaluación en curso → 409 con evaluationId", async () => {
      mockSelect.mockImplementation(() => chain([{ id: "e-run" }]));

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body.evaluationId).toBe("e-run");
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockTrigger).not.toHaveBeenCalled();
    });

    it("ok → 200 con evaluationId y trigger lanzado", async () => {
      mockSelect.mockImplementation(() => chain([]));

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ success: true, evaluationId: "e-1" });
      expect(mockTrigger).toHaveBeenCalledWith("mitre-real-evaluation", {
        evaluationId: "e-1",
      });
    });

    it("Trigger.dev no disponible → fallback local y 200 igualmente", async () => {
      mockSelect.mockImplementation(() => chain([]));
      mockTrigger.mockRejectedValue(new Error("no token"));

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      const svc = await import(
        "@/server/intelligence/adversary/mitre-eval/mitre-service"
      );
      await vi.waitFor(() =>
        expect(vi.mocked(svc.executeMitreEvaluation)).toHaveBeenCalledWith("e-1"),
      );
    });

    it("error de BD → 500", async () => {
      mockSelect.mockImplementation(() => {
        throw new Error("db down");
      });

      const res = await POST(postRequest({ projectId: PROJECT_ID }) as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Error interno");
    });
  });

  describe("GET (listar / detalle)", () => {
    let GET: typeof import("./route").GET;

    beforeEach(async () => {
      const mod = await import("./route");
      GET = mod.GET;
    });

    it("sin sesión → 401", async () => {
      mockUser = null;

      const res = await GET(getRequest(`?projectId=${PROJECT_ID}`) as never);
      expect(res.status).toBe(401);
    });

    it("sin projectId o no UUID → 400", async () => {
      const res1 = await GET(getRequest() as never);
      expect(res1.status).toBe(400);

      const res2 = await GET(getRequest("?projectId=no-uuid") as never);
      expect(res2.status).toBe(400);
      const body = await res2.json();
      expect(body.error).toBe("projectId requerido");
    });

    it("proyecto no propio → 404", async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const res = await GET(getRequest(`?projectId=${PROJECT_ID}`) as never);
      expect(res.status).toBe(404);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("listado → 200 con evaluations", async () => {
      const list = [evaluation, { ...evaluation, id: "e-2" }];
      mockSelect.mockImplementation(() => chain(list));

      const res = await GET(getRequest(`?projectId=${PROJECT_ID}`) as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.evaluations).toHaveLength(2);
    });

    it("detalle con evaluationId → 200 con evaluation y results", async () => {
      mockSelect
        .mockImplementationOnce(() => chain([evaluation]))
        .mockImplementationOnce(() => chain(techniqueResults));

      const res = await GET(
        getRequest(`?projectId=${PROJECT_ID}&evaluationId=e-1`) as never,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.evaluation.id).toBe("e-1");
      expect(body.results).toEqual(techniqueResults);
    });

    it("detalle de evaluación inexistente → 404", async () => {
      mockSelect.mockImplementationOnce(() => chain([]));

      const res = await GET(
        getRequest(`?projectId=${PROJECT_ID}&evaluationId=nope`) as never,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Evaluación no encontrada");
    });

    it("error de BD → 500", async () => {
      mockSelect.mockImplementation(() => {
        throw new Error("db down");
      });

      const res = await GET(getRequest(`?projectId=${PROJECT_ID}`) as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Error interno");
    });
  });
});
