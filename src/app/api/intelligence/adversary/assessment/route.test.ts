/* ═══════════════════════════════════════════════════════════════════════════
   Adversary Assessment — Tests de endpoint

   Verifica los handlers POST/GET/PUT con auth, rate limit, permisos y BD
   simulados:
   - POST: 401/400/404/403 (permiso y gate legal)/400 dominio/409 concurrente,
     200 con Trigger.dev, 200 con fallback local y 500
   - GET: 401/400 (projectId ausente o no UUID)/404, 200 listado y detalle con
     vulnerabilidades, 404 sin evaluación y 500
   - PUT: 401/400/403/404, 200 actualizando consentimiento y 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  interface Chain {
    from: () => Chain;
    where: () => Chain;
    orderBy: () => Chain;
    limit: () => Promise<unknown>;
    values: (values: unknown) => Chain;
    returning: () => Promise<unknown>;
    set: (values: unknown) => Chain;
    then: (
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>;
  }

  const state = {
    selectResults: [] as unknown[][],
    insertResult: [] as unknown[],
    insertValues: [] as unknown[],
    updateValues: [] as unknown[],
  };

  function makeChain(result: unknown): Chain {
    const chain: Chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(result),
      values: (values) => {
        state.insertValues.push(values);
        return chain;
      },
      returning: () => Promise.resolve(result),
      set: (values) => {
        state.updateValues.push(values);
        return chain;
      },
      then: (onfulfilled, onrejected) =>
        Promise.resolve(result).then(onfulfilled, onrejected),
    };
    return chain;
  }

  const db = {
    query: {
      projects: { findFirst: vi.fn() },
    },
    select: vi.fn(() => makeChain(state.selectResults.shift() ?? [])),
    insert: vi.fn(() => makeChain(state.insertResult)),
    update: vi.fn(() => makeChain(undefined)),
  };

  return {
    state,
    db,
    createClient: vi.fn(),
    requireProjectPermission: vi.fn(),
    tasksTrigger: vi.fn(),
    extractTargetHost: vi.fn(),
    failStaleAssessments: vi.fn(),
    executeAssessment: vi.fn(),
    loggerError: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    info: vi.fn(),
  },
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (
    config: { authenticate?: () => Promise<{ id: string } | null> },
    handler: (req: unknown) => Promise<Response>
  ) => {
    return async (req: unknown): Promise<Response> => {
      try {
        if (config.authenticate) {
          const user = await config.authenticate();
          if (!user) {
            return new Response(
              JSON.stringify({ success: false, error: "No autorizado" }),
              { status: 401 }
            );
          }
        }
        return await handler(req);
      } catch {
        return new Response(
          JSON.stringify({ success: false, error: "Error interno" }),
          { status: 500 }
        );
      }
    };
  },
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mocks.requireProjectPermission,
}));

vi.mock("@/shared/db", () => ({
  db: mocks.db,
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: mocks.tasksTrigger },
}));

vi.mock("@/trigger/adversary-assessment.trigger", () => ({
  runAdversaryAssessment: {},
}));

vi.mock("@/server/intelligence/adversary/sandbox-executor", () => ({
  extractTargetHost: mocks.extractTargetHost,
}));

vi.mock(
  "@/server/intelligence/adversary/assessment/assessment-service",
  () => ({
    failStaleAssessments: mocks.failStaleAssessments,
    executeAssessment: mocks.executeAssessment,
  })
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";
const ASSESSMENT_ID = "f1a2b3c4-d5e6-4789-abcd-ef1234567890";
const BASE_URL = "http://localhost:3000/api/intelligence/adversary/assessment";

const authorizedProject = {
  id: PROJECT_ID,
  domain: "https://example.com",
  activeTestingAuthorized: true,
  isDeleted: false,
  deletedAt: null,
};

function setUser(id: string | null): void {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: id ? { id } : null } })),
    },
  });
}

function createRequest(method: string, query = "", body?: unknown): NextRequest {
  return new NextRequest(
    new Request(`${BASE_URL}${query}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

// ─── Tests: POST ─────────────────────────────────────────────────────────────

describe("POST /api/intelligence/adversary/assessment", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.selectResults.length = 0;
    mocks.state.insertResult = [];
    mocks.state.insertValues.length = 0;
    mocks.state.updateValues.length = 0;

    setUser("user-1");
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.db.query.projects.findFirst.mockResolvedValue(authorizedProject);
    mocks.extractTargetHost.mockReturnValue("example.com");
    mocks.tasksTrigger.mockResolvedValue({});
    mocks.failStaleAssessments.mockResolvedValue(undefined);
    mocks.executeAssessment.mockResolvedValue(undefined);

    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns 401 when no user", async () => {
    setUser(null);

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("No autorizado");
    expect(mocks.requireProjectPermission).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is not a uuid", async () => {
    const res = await POST(createRequest("POST", "", { projectId: "nope" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("projectId inválido");
    expect(mocks.requireProjectPermission).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Proyecto no encontrado");
    expect(mocks.requireProjectPermission).toHaveBeenCalledWith(
      "user-1",
      PROJECT_ID,
      "scan:execute"
    );
  });

  it("returns 403 when the user lacks scan:execute permission", async () => {
    mocks.requireProjectPermission.mockResolvedValue(
      "No tienes permiso para esta acción"
    );

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("No tienes permiso para esta acción");
  });

  it("returns 404 when the project row is gone", async () => {
    mocks.db.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("returns 403 when the legal consent gate is not granted", async () => {
    mocks.db.query.projects.findFirst.mockResolvedValue({
      ...authorizedProject,
      activeTestingAuthorized: false,
    });

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("autorización de evaluación activa");
    expect(mocks.extractTargetHost).not.toHaveBeenCalled();
  });

  it("returns 400 when the project has no usable domain", async () => {
    mocks.extractTargetHost.mockReturnValue(null);

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("dominio válido");
    expect(mocks.state.insertValues).toHaveLength(0);
  });

  it("returns 409 when another assessment is already running", async () => {
    mocks.state.selectResults.push([{ id: "running-1" }]);

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Ya hay una evaluación en curso");
    expect(body.assessmentId).toBe("running-1");
    expect(mocks.state.insertValues).toHaveLength(0);
  });

  it("creates the assessment and triggers the remote job", async () => {
    mocks.state.selectResults.push([]);
    mocks.state.insertResult = [{ id: "assess-1" }];

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, assessmentId: "assess-1" });

    expect(mocks.state.insertValues[0]).toMatchObject({
      projectId: PROJECT_ID,
      target: "example.com",
      status: "pending",
    });
    expect(mocks.tasksTrigger).toHaveBeenCalledWith(
      "adversary-real-assessment",
      { assessmentId: "assess-1" }
    );
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it("falls back to local execution when Trigger.dev is unavailable", async () => {
    mocks.state.selectResults.push([]);
    mocks.state.insertResult = [{ id: "assess-2" }];
    mocks.tasksTrigger.mockRejectedValue(new Error("Trigger offline"));

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, assessmentId: "assess-2" });
    expect(mocks.loggerWarn).toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mocks.executeAssessment).toHaveBeenCalledWith("assess-2");
    });
  });

  it("returns 500 on internal error", async () => {
    mocks.db.query.projects.findFirst.mockRejectedValue(new Error("DB down"));

    const res = await POST(createRequest("POST", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Error en POST assessment",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});

// ─── Tests: GET ──────────────────────────────────────────────────────────────

describe("GET /api/intelligence/adversary/assessment", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.selectResults.length = 0;
    mocks.state.insertResult = [];
    mocks.state.insertValues.length = 0;
    mocks.state.updateValues.length = 0;

    setUser("user-1");
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.db.query.projects.findFirst.mockResolvedValue(authorizedProject);
    mocks.extractTargetHost.mockReturnValue("example.com");
    mocks.tasksTrigger.mockResolvedValue({});
    mocks.failStaleAssessments.mockResolvedValue(undefined);
    mocks.executeAssessment.mockResolvedValue(undefined);

    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 when no user", async () => {
    setUser(null);

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
    expect(mocks.failStaleAssessments).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("projectId requerido");
  });

  it("returns 400 when projectId is not a uuid", async () => {
    const res = await GET(createRequest("GET", "?projectId=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("projectId requerido");
  });

  it("returns 404 when the user cannot view the project", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
    expect(mocks.requireProjectPermission).toHaveBeenCalledWith(
      "user-1",
      PROJECT_ID,
      "report:view"
    );
    expect(mocks.failStaleAssessments).not.toHaveBeenCalled();
  });

  it("returns 404 when the project row is gone", async () => {
    mocks.db.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("returns the assessment list for the project", async () => {
    mocks.state.selectResults.push([
      { id: "a1", status: "completed", createdAt: new Date("2026-09-01") },
      { id: "a2", status: "failed", createdAt: new Date("2026-08-01") },
    ]);

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.authorized).toBe(true);
    expect(body.domain).toBe("https://example.com");
    expect(body.assessments).toHaveLength(2);
    expect(body.assessments[0].id).toBe("a1");
    expect(mocks.failStaleAssessments).toHaveBeenCalledTimes(1);
    expect(mocks.state.selectResults).toHaveLength(0);
  });

  it("returns a single assessment with its vulnerabilities", async () => {
    mocks.db.query.projects.findFirst.mockResolvedValue({
      ...authorizedProject,
      activeTestingAuthorized: false,
    });
    mocks.state.selectResults.push(
      [{ id: ASSESSMENT_ID, projectId: PROJECT_ID, status: "completed" }],
      [
        { id: "v2", assessmentId: ASSESSMENT_ID, cvssScore: "9.8" },
        { id: "v1", assessmentId: ASSESSMENT_ID, cvssScore: "7.5" },
      ]
    );

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}&assessmentId=${ASSESSMENT_ID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.authorized).toBe(false);
    expect(body.assessment.id).toBe(ASSESSMENT_ID);
    expect(body.vulnerabilities).toHaveLength(2);
    expect(body.assessments).toBeUndefined();
  });

  it("returns 404 when the assessment does not exist", async () => {
    mocks.state.selectResults.push([]);

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}&assessmentId=${ASSESSMENT_ID}`)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Evaluación no encontrada");
  });

  it("returns 500 when stale recovery fails", async () => {
    mocks.failStaleAssessments.mockRejectedValue(new Error("recovery down"));

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Error en GET assessment",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it("returns 500 when authentication fails", async () => {
    mocks.createClient.mockRejectedValue(new Error("auth boom"));

    const res = await GET(
      createRequest("GET", `?projectId=${PROJECT_ID}`)
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno");
  });
});

// ─── Tests: PUT ──────────────────────────────────────────────────────────────

describe("PUT /api/intelligence/adversary/assessment", () => {
  let PUT: typeof import("./route").PUT;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.selectResults.length = 0;
    mocks.state.insertResult = [];
    mocks.state.insertValues.length = 0;
    mocks.state.updateValues.length = 0;

    setUser("user-1");
    mocks.requireProjectPermission.mockResolvedValue(null);
    mocks.db.query.projects.findFirst.mockResolvedValue(authorizedProject);
    mocks.extractTargetHost.mockReturnValue("example.com");
    mocks.tasksTrigger.mockResolvedValue({});
    mocks.failStaleAssessments.mockResolvedValue(undefined);
    mocks.executeAssessment.mockResolvedValue(undefined);

    const mod = await import("./route");
    PUT = mod.PUT;
  });

  it("returns 401 when no user", async () => {
    setUser(null);

    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: true,
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
  });

  it("returns 400 when the payload is invalid", async () => {
    const res = await PUT(createRequest("PUT", "", { projectId: PROJECT_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Payload inválido");
    expect(mocks.state.updateValues).toHaveLength(0);
  });

  it("returns 403 when the user lacks project:update permission", async () => {
    mocks.requireProjectPermission.mockResolvedValue(
      "No tienes permiso para esta acción"
    );

    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: true,
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("No tienes permiso para esta acción");
    expect(mocks.requireProjectPermission).toHaveBeenCalledWith(
      "user-1",
      PROJECT_ID,
      "project:update"
    );
    expect(mocks.state.updateValues).toHaveLength(0);
  });

  it("returns 404 when the project does not exist", async () => {
    mocks.requireProjectPermission.mockResolvedValue("Proyecto no encontrado");

    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: true,
      })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proyecto no encontrado");
  });

  it("returns 404 when the project row is gone", async () => {
    mocks.db.query.projects.findFirst.mockResolvedValue(undefined);

    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: false,
      })
    );
    expect(res.status).toBe(404);
    expect(mocks.state.updateValues).toHaveLength(0);
  });

  it("updates the consent flag and returns 200", async () => {
    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: true,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mocks.state.updateValues).toHaveLength(1);
    expect(mocks.state.updateValues[0]).toMatchObject({
      activeTestingAuthorized: true,
    });
    expect(
      (mocks.state.updateValues[0] as { updatedAt: unknown }).updatedAt
    ).toBeInstanceOf(Date);
  });

  it("returns 500 on internal error", async () => {
    mocks.db.query.projects.findFirst.mockRejectedValue(new Error("DB down"));

    const res = await PUT(
      createRequest("PUT", "", {
        projectId: PROJECT_ID,
        activeTestingAuthorized: true,
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno");
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Error en PUT assessment",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});
