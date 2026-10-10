import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCurrentUserOrThrow = vi.fn();
const mockRunsFindMany = vi.fn(async () => []);
const mockProjectFindFirst = vi.fn(async () => null);
const mockReturning = vi.fn(async () => []);
const mockCheckRateLimit = vi.fn(async () => ({ success: true, limit: 30, remaining: 29, reset: 60 }));
const mockEgressGuard = vi.fn(async () => undefined);
const mockGetToolDefinition = vi.fn();
const mockExecuteTool = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockReturning }));
const mockIsFlagEnabled = vi.fn(() => false);
const mockEnqueueScanJob = vi.fn();
const mockWakeScanQueueDrain = vi.fn(async () => undefined);

const mockTx = {
  query: {
    intelligenceToolRuns: { findMany: mockRunsFindMany },
    projects: { findFirst: mockProjectFindFirst },
  },
  insert: vi.fn(() => ({ values: mockInsertValues })),
};

vi.mock("@/shared/lib/auth", () => ({
  getCurrentUserOrThrow: mockGetCurrentUserOrThrow,
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  checkIntelScanRateLimit: mockCheckRateLimit,
  buildRateLimitHeaders: (rl: { remaining?: number }) => ({
    "x-ratelimit-remaining": String(rl.remaining ?? 0),
  }),
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  assertPublicHostname: mockEgressGuard,
}));

vi.mock("@/server/intelligence/core/tool-registry", () => ({
  getToolDefinition: mockGetToolDefinition,
}));

vi.mock("@/server/intelligence/core/dispatcher", () => ({
  executeTool: mockExecuteTool,
}));

// C3: la ruta encola en vez de ejecutar en línea cuando el flag `scanQueue`
// está activo; el flag es fail-closed, así que por defecto el mock devuelve off.
vi.mock("@/shared/lib/flags", () => ({
  isFlagEnabled: mockIsFlagEnabled,
}));

// Se mockean sólo las funciones con efectos (encolado/wakeup) y se conserva el
// resto del módulo real: la ruta discrimina la contrapresión con
// `error instanceof QueueFullError`, así que la clase debe ser la de verdad.
vi.mock("@/server/intelligence/scan-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/intelligence/scan-queue")>();
  return {
    ...actual,
    enqueueScanJob: mockEnqueueScanJob,
    wakeScanQueueDrain: mockWakeScanQueueDrain,
  };
});

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id" },
  intelligenceToolRuns: { investigationId: "investigationId", projectId: "projectId", completedAt: "completedAt" },
  intelligenceFindings: {},
}));

vi.mock("@/lib/logger", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function createRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(
    new Request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174000";

const validBody = {
  projectId: PROJECT_ID,
  toolId: "dns-lookup",
  input: { target: "example.com" },
};

const user = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUserOrThrow.mockResolvedValue(user);
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 60 });
  mockEgressGuard.mockResolvedValue(undefined);
  mockGetToolDefinition.mockImplementation((id: string) =>
    id === "dns-lookup" ? { category: "network" } : undefined
  );
  mockProjectFindFirst.mockResolvedValue({ id: PROJECT_ID });
  mockReturning.mockResolvedValue([{ id: "run-1", status: "completed" }]);
  mockExecuteTool.mockResolvedValue({ success: true, output: { answers: [] }, findings: [] });
  mockIsFlagEnabled.mockReturnValue(false);
  mockEnqueueScanJob.mockResolvedValue(null);
});

describe("GET /api/intelligence/runs", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await GET(createRequest("GET", `http://localhost/api/intelligence/runs?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autorizado");
  });

  it("sin projectId ni investigationId → 400", async () => {
    const res = await GET(createRequest("GET", "http://localhost/api/intelligence/runs"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("projectId");
  });

  it("projectId → 200 con lista de runs", async () => {
    mockRunsFindMany.mockResolvedValueOnce([{ id: "run-1" }, { id: "run-2" }]);
    const res = await GET(createRequest("GET", `http://localhost/api/intelligence/runs?projectId=${PROJECT_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runs).toHaveLength(2);
    expect(mockRunsFindMany).toHaveBeenCalledTimes(1);
  });

  it("investigationId → 200 (filtra por investigación)", async () => {
    const invId = "223e4567-e89b-12d3-a456-426614174000";
    mockRunsFindMany.mockResolvedValueOnce([{ id: "run-9" }]);
    const res = await GET(createRequest("GET", `http://localhost/api/intelligence/runs?investigationId=${invId}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
  });
});

describe("POST /api/intelligence/runs", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("sin sesión → 401", async () => {
    mockGetCurrentUserOrThrow.mockRejectedValue(new Error("No autorizado"));
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));
    expect(res.status).toBe(401);
  });

  it("body inválido (sin projectId/toolId) → 400 con detalle de validación", async () => {
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", { input: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Argumentos inválidos");
  });

  it("rate limit excedido → 429 con headers", async () => {
    mockCheckRateLimit.mockResolvedValue({ success: false, limit: 30, remaining: 0, reset: 60 });
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));
    expect(res.status).toBe(429);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
  });

  it("toolId no registrado → 404", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost/api/intelligence/runs", { ...validBody, toolId: "no-existe" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("no está registrada");
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("proyecto ajeno/inexistente (RLS) → 404", async () => {
    mockProjectFindFirst.mockResolvedValue(null);
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Proyecto no encontrado");
  });

  it("input sin target → 400", async () => {
    const res = await POST(
      createRequest("POST", "http://localhost/api/intelligence/runs", { ...validBody, input: {} })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("target");
  });

  it("target bloqueado por EgressGuard (SSRF) → 403", async () => {
    mockEgressGuard.mockRejectedValue(new Error("private network"));
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("EgressGuard");
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it("ejecución exitosa → 200, despacha la tool y registra el run", async () => {
    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.run.id).toBe("run-1");
    expect(mockExecuteTool).toHaveBeenCalledWith(
      "dns-lookup",
      "example.com",
      validBody.input,
      PROJECT_ID,
      undefined,
      "user-1"
    );
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockReturning).toHaveBeenCalledTimes(1);
  });

  it("flag scanQueue activo → 202 encolado y NO ejecuta en línea", async () => {
    mockIsFlagEnabled.mockReturnValue(true);
    mockEnqueueScanJob.mockResolvedValue({ id: "job-1", plan: "pro" });

    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, queued: true, job: { id: "job-1", plan: "pro" } });
    expect(mockEnqueueScanJob).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, toolId: "dns-lookup", userId: "user-1" })
    );
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockWakeScanQueueDrain).toHaveBeenCalledTimes(1);
  });

  it("flag activo y cola llena → 429 accionable y NO ejecuta en línea", async () => {
    // Import dinámico: la clase real del módulo mockeado (con `importOriginal`),
    // para que el `instanceof` de la ruta se cumpla. Un import estático aquí se
    // izaría junto al `vi.mock` y evaluaría el factory antes de inicializar los
    // mocks ("Cannot access 'mockEnqueueScanJob' before initialization").
    const { QueueFullError } = await import("@/server/intelligence/scan-queue");

    mockIsFlagEnabled.mockReturnValue(true);
    mockEnqueueScanJob.mockRejectedValue(new QueueFullError(PROJECT_ID, 10, 10));

    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Límite de escaneos en cola alcanzado");
    expect(body.queue).toEqual({ depth: 10, limit: 10 });
    // Degradar al camino síncrono sería volver a lanzar el trabajo rechazado.
    expect(mockExecuteTool).not.toHaveBeenCalled();
    expect(mockWakeScanQueueDrain).not.toHaveBeenCalled();
  });

  it("flag activo pero la cola no está disponible → cae al camino síncrono", async () => {
    mockIsFlagEnabled.mockReturnValue(true);
    mockEnqueueScanJob.mockResolvedValue(null);

    const res = await POST(createRequest("POST", "http://localhost/api/intelligence/runs", validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockExecuteTool).toHaveBeenCalledTimes(1);
  });
});
