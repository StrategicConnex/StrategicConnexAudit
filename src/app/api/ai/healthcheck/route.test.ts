import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockLogSecurityEvent = vi.fn();
const mockInsert = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn();
const mockIsCronAuthorized = vi.fn();

vi.mock("@/shared/db", () => ({
  directDb: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/shared/db/schemas/health", () => ({
  aiHealthLogs: { id: "id" },
}));

vi.mock("@/shared/lib/audit-log", () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
}));

vi.mock("@/server/ai/ai-router", () => ({
  TASK_ROUTING: {
    "general-chat": ["model-a:free", "model-b:free"],
    "copilot-remediation": ["model-a:free", "model-c:free"],
  },
}));

vi.mock("@/server/auth/cron", () => ({
  isCronAuthorized: (...args: unknown[]) => mockIsCronAuthorized(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/config/env-secrets", () => ({
  envSecrets: {
    get openRouterApiKey() { return process.env.OPENROUTER_API_KEY; },
    get openRouterBaseUrl() { return process.env.OPENROUTER_BASE_URL; },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(path = ""): Request {
  const url = `http://localhost:3000/api/ai/healthcheck${path}`;
  return new Request(url);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/ai/healthcheck", () => {
  let GET: typeof import("./route").GET;
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    origEnv.CRON_SECRET = process.env.CRON_SECRET;
    origEnv.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    origEnv.NODE_ENV = process.env.NODE_ENV;
    process.env.CRON_SECRET = "";
    process.env.NODE_ENV = "test";
    const mod = await import("./route");
    GET = mod.GET;

    // Default: DB insert chain
    mockReturning.mockResolvedValue([{ id: "log-1" }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  afterEach(() => {
    if (origEnv.CRON_SECRET !== undefined) process.env.CRON_SECRET = origEnv.CRON_SECRET;
    else delete process.env.CRON_SECRET;
    if (origEnv.OPENROUTER_API_KEY !== undefined) process.env.OPENROUTER_API_KEY = origEnv.OPENROUTER_API_KEY;
    else delete process.env.OPENROUTER_API_KEY;
    if (origEnv.NODE_ENV !== undefined) process.env.NODE_ENV = origEnv.NODE_ENV;
    else delete process.env.NODE_ENV;
    vi.restoreAllMocks();
  });

  it("returns 401 when cron not authorized and CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockIsCronAuthorized.mockReturnValue(false);

    const res = await GET(createRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 500 when cron not authorized and no CRON_SECRET", async () => {
    process.env.CRON_SECRET = "";
    mockIsCronAuthorized.mockReturnValue(false);

    const res = await GET(createRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("CRON_SECRET no configurado");
  });

  it("returns 200 healthy when all models respond successfully", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "green orange blue" } }],
        model: "model-a:free",
      }),
    });

    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overallStatus).toBe("healthy");
    expect(body.modelsHealthy).toBe(3);
    expect(body.modelsFailed).toBe(0);
    expect(body.modelResults).toHaveLength(3);
  });

  it("returns degraded when some models fail", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "response" } }],
            model: "model-a:free",
          }),
        };
      }
      return { ok: false, status: 500, text: async () => "Server error" };
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overallStatus).toBe("degraded");
  });

  it("returns unhealthy when all models fail", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server error",
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overallStatus).toBe("unhealthy");
    expect(body.modelsFailed).toBe(3);
  });

  it("marks 429 as degraded not failed", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("degraded");
    expect(body.modelsFailed).toBe(2);
  });

  it("marks 402 as degraded", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Insufficient credits",
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("degraded");
  });

  it("marks empty response as degraded", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
        model: "model-a:free",
      }),
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("degraded");
  });

  it("marks missing OPENROUTER_API_KEY as failed", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    delete process.env.OPENROUTER_API_KEY;

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("unhealthy");
    expect(body.modelResults[0].error).toContain("OPENROUTER_API_KEY no configurada");
  });

  it("marks timeout as degraded", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockRejectedValue(new Error("The operation was aborted (timeout)"));

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("degraded");
  });

  it("marks non-timeout fetch error as failed", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.overallStatus).toBe("unhealthy");
  });

  it("logs security events for failed models", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "error",
    });

    await GET(createRequest());
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "ai_model_health",
      expect.objectContaining({ metadata: expect.objectContaining({ status: "failed" }) })
    );
  });

  it("logs security events for degraded models", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    await GET(createRequest());
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      "invalid_input",
      expect.objectContaining({ metadata: expect.objectContaining({ status: "degraded" }) })
    );
  });

  it("uses custom trigger source from query param", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        model: "model-a:free",
      }),
    });

    const res = await GET(createRequest("?trigger=manual"));
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("handles persistResult failure gracefully", async () => {
    mockIsCronAuthorized.mockReturnValue(true);
    process.env.OPENROUTER_API_KEY = "test-key";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        model: "model-a:free",
      }),
    });

    mockInsert.mockImplementation(() => {
      throw new Error("Table does not exist");
    });

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recordedAt).toBeNull();
  });

  it("returns 500 on fatal error", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mockFetch.mockRejectedValue(new Error("fatal"));
    const OriginalURL = globalThis.URL;
    let urlCallCount = 0;
    globalThis.URL = class extends OriginalURL {
      constructor(...args: ConstructorParameters<typeof OriginalURL>) {
        urlCallCount++;
        if (urlCallCount === 2) throw new Error("URL constructor failed");
        super(...args);
      }
    } as typeof OriginalURL;

    const res = await GET(createRequest());
    const body = await res.json();
    expect(body.success).toBe(false);

    globalThis.URL = OriginalURL;
  });
});
