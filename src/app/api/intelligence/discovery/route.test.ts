/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Discovery — Tests de endpoint (TD-03 lote 2)

   GET lista activos descubiertos; POST descubre (fase de red, sin transacción)
   y persiste dentro de la transacción RLS del usuario, con timeout de 28s.
   Verifica:
   - GET: 401 sin sesión, 400 sin projectId, 404 proyecto borrado/oculto/no
     propio (soft-delete), 200 con assets/total, error BD → 500
   - POST: 429 rate limit, 400 sin projectId, 404, 200 completed con módulos
     mapeados, timeout 28s → status running, rechazo → 500
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// El barrel de schemas se evalúa primero para romper el ciclo
// intelligence.ts ↔ index.ts ↔ adversary.ts (targetTypeEnum).
import "@/shared/db/schemas";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockSelect = vi.fn();
const mockRateLimit = vi.fn();
const mockDiscoverAssets = vi.fn();
const mockPersistDiscovery = vi.fn();
/** Sesiones RLS abiertas durante la petición, para comprobar QUIÉN persiste. */
const rlsSessions: Array<{ userId: string; tx: unknown }> = [];

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: (...args: unknown[]) => mockSelect(...args) };
    rlsSessions.push({ userId, tx });
    return cb(tx);
  },
}));

vi.mock("@/shared/lib/ratelimit", () => ({
  checkIntelScanRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

// P0.2: el orquestador se usa en dos fases —red y persistencia— porque la de red
// puede durar minutos y no debe retener una transacción.
vi.mock("@/server/intelligence/discovery/orchestrator", () => ({
  discoverAssets: (...args: unknown[]) => mockDiscoverAssets(...args),
  persistDiscovery: (...args: unknown[]) => mockPersistDiscovery(...args),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/discovery${query}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/intelligence/discovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const project = { id: "p1", domain: "example.com", ownerId: "u-1" };
const assetRows = [
  { id: "a1", assetType: "subdomain", lastSeenAt: new Date() },
  { id: "a2", assetType: "service", lastSeenAt: new Date() },
];

// select #1 → proyecto; #2 → lista de activos; #3 → conteo
function setupSelects({
  withProject = true,
  total = 7,
}: { withProject?: boolean; total?: number } = {}) {
  mockSelect.mockReset();
  const projectChain = {
    from: () => projectChain,
    where: () => projectChain,
    limit: () => Promise.resolve(withProject ? [project] : []),
  };
  const assetChain = {
    from: () => assetChain,
    where: () => assetChain,
    orderBy: () => assetChain,
    limit: (n: number) => {
      (assetChain as { lastLimit?: number }).lastLimit = n;
      return assetChain;
    },
    offset: () => Promise.resolve(assetRows),
  };
  const countChain = {
    from: () => ({ where: () => Promise.resolve([{ total }]) }),
  };
  mockSelect
    .mockReturnValueOnce(projectChain)
    .mockReturnValueOnce(assetChain)
    .mockReturnValueOnce(countChain);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Discovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET (listar activos)", () => {
    let GET: typeof import("./route").GET;

    beforeEach(async () => {
      vi.clearAllMocks();
      mockUser = { id: "u-1" };
      setupSelects();
      const mod = await import("./route");
      GET = mod.GET;
    });

    it("sin sesión → 401", async () => {
      mockUser = null;

      const res = await GET(getRequest("?projectId=p1") as never);
      expect(res.status).toBe(401);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("sin projectId → 400", async () => {
      const res = await GET(getRequest() as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("projectId es requerido");
    });

    it("proyecto borrado/oculto/no propio → 404", async () => {
      setupSelects({ withProject: false });

      const res = await GET(getRequest("?projectId=p1") as never);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Proyecto no encontrado");
    });

    it("200 con activos, total y proyecto", async () => {
      const res = await GET(getRequest("?projectId=p1&limit=100") as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.assets).toHaveLength(2);
      expect(body.total).toBe(7);
      expect(body.project.domain).toBe("example.com");
    });

    it("error de BD → 500", async () => {
      mockSelect.mockReset();
      mockSelect.mockImplementation(() => {
        throw new Error("db down");
      });

      const res = await GET(getRequest("?projectId=p1") as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Error interno del servidor");
    });
  });

  describe("POST (ejecutar descubrimiento)", () => {
    let POST: typeof import("./route").POST;

    beforeEach(async () => {
      vi.clearAllMocks();
      mockUser = { id: "u-1" };
      mockRateLimit.mockResolvedValue({ success: true, remaining: 30 });
      mockDiscoverAssets.mockResolvedValue([]);
      mockPersistDiscovery.mockResolvedValue({ totalNewAssets: 0, totalChanges: 0 });
      rlsSessions.length = 0;
      setupSelects();
      const mod = await import("./route");
      POST = mod.POST;
    });

    it("rate limit agotado → 429 con retryAfter", async () => {
      mockRateLimit.mockResolvedValue({ success: false, retryAfter: 60 });

      const res = await POST(postRequest({ projectId: "p1" }) as never);
      expect(res.status).toBe(429);

      const body = await res.json();
      expect(body.retryAfter).toBe(60);
      expect(mockDiscoverAssets).not.toHaveBeenCalled();
    });

    it("sin projectId → 400", async () => {
      const res = await POST(postRequest({}) as never);
      expect(res.status).toBe(400);
      expect(mockDiscoverAssets).not.toHaveBeenCalled();
    });

    it("proyecto no encontrado → 404", async () => {
      setupSelects({ withProject: false });

      const res = await POST(postRequest({ projectId: "p1" }) as never);
      expect(res.status).toBe(404);
      expect(mockDiscoverAssets).not.toHaveBeenCalled();
    });

    it("descubrimiento completo → 200 completed con módulos mapeados", async () => {
      mockDiscoverAssets.mockResolvedValue([
        {
          moduleId: "dns",
          moduleName: "DNS Brute Force",
          success: true,
          assets: [{ id: "a" }, { id: "b" }],
          durationMs: 1200,
          error: null,
        },
      ]);
      mockPersistDiscovery.mockResolvedValue({ totalNewAssets: 3, totalChanges: 1 });

      const res = await POST(postRequest({ projectId: "p1" }) as never);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("completed");
      expect(body.message).toContain("3 activos nuevos");
      expect(body.result.modules[0]).toEqual({
        moduleId: "dns",
        moduleName: "DNS Brute Force",
        success: true,
        assetCount: 2,
        durationMs: 1200,
        error: null,
      });
      expect(mockDiscoverAssets).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "example.com",
          projectId: "p1",
          timeoutMs: 120_000,
          dnsBruteForce: true,
        }),
      );
    });

    it("P0.2: la persistencia corre dentro de la transacción RLS del usuario", async () => {
      mockDiscoverAssets.mockResolvedValue([]);

      await POST(postRequest({ projectId: "p1" }) as never);

      const [tx, input] = mockPersistDiscovery.mock.calls[0]!;
      // Mismo contrato que el resto de P0.2: si alguien pasa `directDb` en vez
      // de la transacción de la sesión, este assert falla.
      expect(rlsSessions.map((s) => s.userId)).toEqual(["u-1", "u-1"]);
      expect(rlsSessions.some((s) => s.tx === tx)).toBe(true);
      expect(input).toEqual(expect.objectContaining({ projectId: "p1", domain: "example.com" }));
    });

    it("el discovery no termina en 28s → 200 status running", async () => {
      vi.useFakeTimers();
      mockDiscoverAssets.mockReturnValue(new Promise(() => {}));

      const pending = POST(postRequest({ projectId: "p1" }) as never);
      await vi.advanceTimersByTimeAsync(28_001);
      const res = await pending;

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("running");
      expect(body.message).toContain("Descubrimiento iniciado");
    });

    it("fallo al persistir → 500", async () => {
      mockPersistDiscovery.mockRejectedValue(new Error("scan failed"));

      const res = await POST(postRequest({ projectId: "p1" }) as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Error interno del servidor");
    });
  });
});
