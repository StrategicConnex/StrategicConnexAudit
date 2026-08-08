/* ═══════════════════════════════════════════════════════════════════════════
   Cron: Uptime — Tests de endpoint
   
   Verifica:
   - Autenticación CRON_SECRET en producción
   - Sin proyectos activos → mensaje vacío
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn();
const mockValues = vi.fn();

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cron: Uptime — Auth", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
