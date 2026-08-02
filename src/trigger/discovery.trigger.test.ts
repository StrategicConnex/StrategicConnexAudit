/* ═══════════════════════════════════════════════════════════════════════════
   Trigger: Continuous Discovery — Tests del task programado (P0)

   Verifica:
   - Registro del task (id + cron correctos)
   - Consulta de proyectos activos (deletedAt IS NULL)
   - Ejecución de runDiscovery por proyecto con mapeo de resultados
   - Tolerancia a errores por proyecto (el ciclo continúa)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface DiscoveryTaskConfig {
  id: string;
  cron: string;
  run: (payload: { timestamp: string }) => Promise<Record<string, unknown>>;
}

interface DiscoveryModuleResult {
  moduleId: string;
  moduleName: string;
  success: boolean;
  assets: Array<{ assetType: string; value: string }>;
  findings: unknown[];
  durationMs: number;
}

interface DiscoveryRunResult {
  domain: string;
  projectId: string;
  timestamp: string;
  totalNewAssets: number;
  totalChanges: number;
  modules: DiscoveryModuleResult[];
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunDiscovery = vi.fn<() => Promise<DiscoveryRunResult>>();

vi.mock("@/server/intelligence/discovery/orchestrator", () => ({
  runDiscovery: mockRunDiscovery,
}));

const mockWhere = vi.fn<() => Promise<unknown[]>>();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/shared/db", () => ({
  db: { select: mockSelect },
}));

vi.mock("@/shared/db/schemas", () => ({
  projects: { id: "id", deletedAt: "deletedAt", name: "name", domain: "domain" },
}));

vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config: DiscoveryTaskConfig) => config),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const activeProject = { id: "p1", name: "Acme", domain: "acme.com", deletedAt: null };

const discoveryResult: DiscoveryRunResult = {
  domain: "acme.com",
  projectId: "p1",
  timestamp: "2026-08-02T00:00:00.000Z",
  totalNewAssets: 3,
  totalChanges: 2,
  modules: [
    {
      moduleId: "dns-brute",
      moduleName: "DNS Brute",
      success: true,
      assets: [{ assetType: "subdomain", value: "a.acme.com" }],
      findings: [],
      durationMs: 120,
    },
    {
      moduleId: "ct-monitor",
      moduleName: "CT Monitor",
      success: true,
      assets: [{ assetType: "cert", value: "cert-1" }, { assetType: "cert", value: "cert-2" }],
      findings: [],
      durationMs: 80,
    },
  ],
};

const runPayload = { timestamp: "2026-08-02T00:00:00.000Z" };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Trigger: Continuous Discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el task con id y cron correctos", async () => {
    const { continuousDiscovery } = await import("./discovery.trigger");
    const task = continuousDiscovery as unknown as DiscoveryTaskConfig;
    expect(task.id).toBe("continuous-discovery");
    expect(task.cron).toBe("0 */6 * * *");
  });

  it("sin proyectos activos → processed 0 y sin ejecutar discovery", async () => {
    mockWhere.mockResolvedValue([]);

    const { continuousDiscovery } = await import("./discovery.trigger");
    const task = continuousDiscovery as unknown as DiscoveryTaskConfig;
    const result = await task.run(runPayload);

    expect(result.processed).toBe(0);
    expect(result.successCount).toBe(0);
    expect(mockRunDiscovery).not.toHaveBeenCalled();
  });

  it("con proyecto activo → ejecuta runDiscovery con config correcta y mapea resultados", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunDiscovery.mockResolvedValue(discoveryResult);

    const { continuousDiscovery } = await import("./discovery.trigger");
    const task = continuousDiscovery as unknown as DiscoveryTaskConfig;
    const result = await task.run(runPayload);

    expect(mockRunDiscovery).toHaveBeenCalledWith({
      domain: "acme.com",
      projectId: "p1",
      timeoutMs: 120_000,
      dnsBruteForce: true,
      ctMonitor: true,
      shadowDetection: true,
    });

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.totalNewAssets).toBe(3);

    const first = (result.results as Array<Record<string, unknown>>)[0];
    expect(first.newAssets).toBe(3);
    expect(first.totalChanges).toBe(2);
    expect(first.modules).toHaveLength(2);
  });

  it("error en un proyecto → se captura y el ciclo continúa", async () => {
    mockWhere.mockResolvedValue([activeProject]);
    mockRunDiscovery.mockRejectedValue(new Error("DNS timeout"));

    const { continuousDiscovery } = await import("./discovery.trigger");
    const task = continuousDiscovery as unknown as DiscoveryTaskConfig;
    const result = await task.run(runPayload);

    expect(result.processed).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.errorCount).toBe(1);

    const first = (result.results as Array<Record<string, unknown>>)[0];
    expect(first.error).toBe("DNS timeout");
    expect(first.newAssets).toBe(0);
  });
});
