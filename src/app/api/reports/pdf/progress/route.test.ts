import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn(async () => ({ data: { user: null as { id: string } | null } }));
const mockRedisGet = vi.fn();
const mockRedisDel = vi.fn(async () => 1);

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  redis: { get: mockRedisGet, del: mockRedisDel },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function createRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: "GET" }));
}

const user = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user } });
  mockRedisDel.mockResolvedValue(1);
});

async function readFirstChunk(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe("GET /api/reports/pdf/progress — SSE de progreso (VULN-007)", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=12345678"));
    expect(res.status).toBe(401);
  });

  it("genId ausente → 400", async () => {
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress"));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing or invalid genId");
  });

  it("genId corto (<8) → 400", async () => {
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=abc"));
    expect(res.status).toBe(400);
  });

  it("sesión válida → 200 text/event-stream y clave Redis namespaceada por usuario", async () => {
    mockRedisGet.mockResolvedValue({ percent: 100, status: "complete" });
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=gen-12345678"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");

    const chunk = await readFirstChunk(res);
    expect(chunk).toContain("event: complete");
    expect(mockRedisGet).toHaveBeenCalledWith("pdf_progress:user-1:gen-12345678");
  });

  it("progreso en curso → evento progress con percent y step", async () => {
    mockRedisGet.mockResolvedValue({ percent: 40, step: "Crawling" });
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=gen-12345678"));
    const chunk = await readFirstChunk(res);
    expect(chunk).toContain("event: progress");
    expect(chunk).toContain('"percent":40');
    expect(chunk).toContain('"step":"Crawling"');
  });

  it("sin clave en Redis → heartbeat en lugar de evento", async () => {
    mockRedisGet.mockResolvedValue(null);
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=gen-12345678"));
    const chunk = await readFirstChunk(res);
    expect(chunk).toContain(": heartbeat");
  });

  it("generación con error → evento error y limpieza de la clave", async () => {
    mockRedisGet.mockResolvedValue({ status: "error", error: "render failed" });
    const res = await GET(createRequest("http://localhost/api/reports/pdf/progress?genId=gen-12345678"));
    const chunk = await readFirstChunk(res);
    expect(chunk).toContain("event: error");
    expect(chunk).toContain("render failed");
    expect(mockRedisDel).toHaveBeenCalledWith("pdf_progress:user-1:gen-12345678");
  });
});
