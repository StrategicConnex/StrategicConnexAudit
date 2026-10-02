/* ═══════════════════════════════════════════════════════════════════════════
   Cron: Uptime — Tests de endpoint

   Verifica:
   - Autenticación CRON_SECRET en producción
   - Sin proyectos activos → mensaje vacío
   - Presupuesto de tiempo: corta antes del timeout de Vercel y reporta pendientes
   - Rotación diaria de la cola de proyectos
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn();
const mockValues = vi.fn();

const { mockValidateSafeUrl, mockNormalizeUrl, mockSafeFetchFollow } = vi.hoisted(() => ({
  mockValidateSafeUrl: vi.fn(),
  mockNormalizeUrl: vi.fn((url: string) => url),
  mockSafeFetchFollow: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  db: {
    query: {
      projects: { findMany: mockFindMany },
    },
    insert: vi.fn(() => ({ values: mockValues })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", deletedAt: "deletedAt" },
  uptimeLogs: { projectId: "projectId" },
}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  validateSafeUrl: mockValidateSafeUrl,
  normalizeUrl: mockNormalizeUrl,
  safeFetchFollow: mockSafeFetchFollow,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProjects(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    domain: `https://site${i}.test`,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cron: Uptime — Auth", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockValidateSafeUrl.mockResolvedValue(undefined);
    mockNormalizeUrl.mockImplementation((url: string) => url);
    mockSafeFetchFollow.mockResolvedValue({ status: 200, ok: true });
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("producción sin CRON_SECRET → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "supersecret");

    const req = new Request("http://localhost:3000/api/cron/uptime", {});
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("producción con CRON_SECRET correcto → 200", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "supersecret");

    mockFindMany.mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/cron/uptime", {
      headers: { authorization: "Bearer supersecret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("desarrollo sin auth → 200 (no requiere CRON_SECRET)", async () => {
    vi.stubEnv("NODE_ENV", "development");

    mockFindMany.mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/cron/uptime", {});
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("sin proyectos activos → mensaje informativo", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockFindMany.mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/cron/uptime", {});
    const res = await GET(req);
    const body = await res.json();
    expect(body.message).toContain("No active projects");
  });
});

describe("Cron: Uptime — Presupuesto de tiempo", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    mockValidateSafeUrl.mockResolvedValue(undefined);
    mockNormalizeUrl.mockImplementation((url: string) => url);
    mockSafeFetchFollow.mockResolvedValue({ status: 200, ok: true });
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("proyectos dentro del presupuesto → todos comprobados y 0 pendientes", async () => {
    mockFindMany.mockResolvedValue(makeProjects(2));

    const res = await GET(new Request("http://localhost:3000/api/cron/uptime", {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checked).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.total).toBe(2);
    expect(body.results).toHaveLength(2);
    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(body.results.every((r: { isUp: boolean }) => r.isUp === true)).toBe(true);
  });

  it("presupuesto agotado → corta el lote y reporta los pendientes", async () => {
    mockFindMany.mockResolvedValue(makeProjects(10));

    const realNow = Date.now();
    let calls = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      calls += 1;
      return realNow + calls * 30_000;
    });

    const res = await GET(new Request("http://localhost:3000/api/cron/uptime", {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checked).toBe(6);
    expect(body.skipped).toBe(4);
    expect(body.total).toBe(10);
    expect(mockValues).toHaveBeenCalledTimes(6);
  });

  it("sin dominio no genera comprobación", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a", domain: null },
      { id: "b", domain: "https://ok.test" },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/cron/uptime", {}));
    const body = await res.json();

    expect(body.checked).toBe(1);
    expect(body.total).toBe(1);
    expect(body.results[0].projectId).toBe("b");
  });

  it("respuesta con fallo de red → sigue registrado como down", async () => {
    mockFindMany.mockResolvedValue(makeProjects(1));
    mockSafeFetchFollow.mockRejectedValue(new Error("ETIMEDOUT"));

    const res = await GET(new Request("http://localhost:3000/api/cron/uptime", {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results[0].isUp).toBe(false);
    expect(body.results[0].error).toBe("ETIMEDOUT");
    expect(mockValues).toHaveBeenCalledTimes(1);
  });
});
