import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockAssertAiQuota = vi.fn();
const mockAssertProjectAccess = vi.fn();
const mockWithRLS = vi.fn();
const mockTasksTrigger = vi.fn();
const mockGenerateSeoReport = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  withRateLimit: (config: Record<string, unknown>, handler: (...args: unknown[]) => Promise<Response>) => {
    return async (req: NextRequest) => {
      try {
        if (config.authenticate) {
          const user = await config.authenticate();
          if (!user) {
            return new Response(JSON.stringify({ success: false, error: "No autorizado" }), { status: 401 });
          }
          return handler(req, user.id);
        }
        return handler(req, "mock-user-id");
      } catch {
        return new Response(JSON.stringify({ success: false, error: "Error interno" }), { status: 500 });
      }
    };
  },
}));

vi.mock("@/server/ai/ai-usage", () => ({
  assertAiQuota: (...args: unknown[]) => mockAssertAiQuota(...args),
}));

vi.mock("@/server/lib/project-access", () => ({
  assertProjectAccess: (...args: unknown[]) => mockAssertProjectAccess(...args),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (...args: unknown[]) => mockWithRLS(...args),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    trigger: (...args: unknown[]) => mockTasksTrigger(...args),
  },
}));

vi.mock("@/trigger/ai-report.trigger", () => ({
  runAiSeoReport: {},
}));

vi.mock("@/server/ai/seo-report-service", () => ({
  generateSeoReport: (...args: unknown[]) => mockGenerateSeoReport(...args),
}));

vi.mock("@/shared/db/schemas", () => ({
  aiReportJobs: { id: "id", projectId: "projectId", userId: "userId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function createRequest(method: string, path: string, body?: unknown): NextRequest {
  const url = `http://localhost:3000/api/ai/report${path}`;
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

describe("POST /api/ai/report", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("returns quota error when assertAiQuota blocks", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "quota exceeded" }), { status: 429 })
    );

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(429);
    expect(mockAssertAiQuota).toHaveBeenCalledWith("u1", "seo-report");
  });

  it("returns 400 when projectId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);

    const res = await POST(createRequest("POST", "", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("projectId");
  });

  it("returns 404 when project access denied", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);
    mockAssertProjectAccess.mockResolvedValue({ ok: false });

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(404);
  });

  it("returns 500 when job creation returns empty array", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([]);

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("No se pudo crear");
  });

  it("returns pending when trigger.dev succeeds", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([{ id: "job-1" }]);
    mockTasksTrigger.mockResolvedValue({});

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pending).toBe(true);
    expect(body.jobId).toBe("job-1");
  });

  it("falls back to synchronous when trigger.dev throws", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([{ id: "job-1" }]);
    mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev offline"));
    mockGenerateSeoReport.mockResolvedValue({
      ok: true,
      report: "# SEO Report",
      isFallback: true,
      modelUsed: "fallback-model",
      fromCache: false,
    });

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toBe("# SEO Report");
    expect(body.isFallback).toBe(true);
  });

  it("returns error from fallback when generateSeoReport fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockAssertAiQuota.mockResolvedValue(null);
    mockAssertProjectAccess.mockResolvedValue({ ok: true });
    mockWithRLS.mockResolvedValue([{ id: "job-1" }]);
    mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev offline"));
    mockGenerateSeoReport.mockResolvedValue({
      ok: false,
      error: "Generation failed",
      status: 500,
    });

    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 on unexpected error", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));
    const res = await POST(createRequest("POST", "", { projectId: "p1" }));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/ai/report", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("GET", "?jobId=j1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(createRequest("GET", ""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Falta jobId");
  });

  it("returns 404 when job not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockWithRLS.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "?jobId=nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("no encontrado");
  });

  it("returns job status with all fields", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockWithRLS.mockResolvedValue({
      id: "j1",
      status: "completed",
      report: "# Report",
      isFallback: false,
      modelUsed: "gpt-4",
      error: null,
    });

    const res = await GET(createRequest("GET", "?jobId=j1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("completed");
    expect(body.report).toBe("# Report");
    expect(body.modelUsed).toBe("gpt-4");
  });

  it("returns 500 on internal error", async () => {
    mockGetUser.mockRejectedValue(new Error("boom"));
    const res = await GET(createRequest("GET", "?jobId=j1"));
    expect(res.status).toBe(500);
  });
});
