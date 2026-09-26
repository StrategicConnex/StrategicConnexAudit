/* ═══════════════════════════════════════════════════════════════════════════
   Intelligence: Assets Graph — Tests de endpoint (TD-03 lote 2)

   Genera grafo React Flow (nodos/aristas) desde assets + hallazgos bajo RLS.
   Verifica:
   - 401 sin sesión; 400 sin projectId; 500 en error de BD
   - Nodo raíz del proyecto + nodos de assets con etiquetas (ip/asn/mx)
   - Marcado isVulnerable (solo high/critical con affectedAsset coincidente)
   - Aristas: relatedIp conecta al IP relacionado; sin relatedIp → a la raíz
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUser: { id: string } | null = { id: "u-1" };
const mockAssetsFindMany = vi.fn();
const mockFindingsFindMany = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}));

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      query: {
        intelligenceAssets: {
          findMany: (...args: unknown[]) => mockAssetsFindMany(...args),
        },
        intelligenceFindings: {
          findMany: (...args: unknown[]) => mockFindingsFindMany(...args),
        },
      },
    }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRequest(query = ""): Request {
  return new Request(`http://localhost:3000/api/intelligence/assets/graph${query}`);
}

const assets = [
  { id: "a1", value: "example.com", assetType: "domain", metadata: null },
  { id: "a2", value: "203.0.113.5", assetType: "ip", metadata: null },
  { id: "a3", value: "mail.example.com", assetType: "mx", metadata: { relatedIp: "203.0.113.5" } },
  { id: "a4", value: "AS64500", assetType: "asn", metadata: null },
];

const findings = [
  { affectedAsset: "example.com", severity: "critical", title: "TLS 1.0" },
  { affectedAsset: "example.com", severity: "medium", title: "Header menor" },
  { affectedAsset: "other.host", severity: "high", title: "Otro activo" },
];

type GraphNode = {
  id: string;
  data: { label: string; isVulnerable: boolean };
};
type GraphEdge = { id: string; source: string; target: string };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Intelligence: Assets Graph — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUser = { id: "u-1" };
    mockAssetsFindMany.mockResolvedValue(assets);
    mockFindingsFindMany.mockResolvedValue(findings);
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("sin sesión → 401", async () => {
    mockUser = null;

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(401);
    expect(mockAssetsFindMany).not.toHaveBeenCalled();
  });

  it("sin projectId → 400", async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing projectId");
  });

  it("200 con nodo raíz, nodos de assets y etiquetas mapeadas", async () => {
    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    const nodes = body.data.nodes as GraphNode[];
    expect(nodes[0]).toMatchObject({
      id: "project-p1",
      type: "input",
      data: { label: "Project Target", type: "root" },
    });
    expect(nodes).toHaveLength(5);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("asset-a1")!.data.label).toBe("example.com");
    expect(byId.get("asset-a2")!.data.label).toBe("IP: 203.0.113.5");
    expect(byId.get("asset-a3")!.data.label).toBe("MX: mail.example.com");
    expect(byId.get("asset-a4")!.data.label).toBe("ASN: AS64500");

    // Vulnerable: solo high/critical con affectedAsset === value
    expect(byId.get("asset-a1")!.data.isVulnerable).toBe(true);
    expect(byId.get("asset-a2")!.data.isVulnerable).toBe(false);
    expect(byId.get("asset-a4")!.data.isVulnerable).toBe(false);

    expect(mockAssetsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
    expect(mockFindingsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("aristas: sin relatedIp → a la raíz; con relatedIp → al IP relacionado", async () => {
    const res = await GET(getRequest("?projectId=p1") as never);
    const body = await res.json();

    const edges = body.data.edges as GraphEdge[];
    const edgeIds = edges.map((e) => e.id);

    // a1, a2 y a4 (sin relatedIp) cuelgan de la raíz
    expect(edgeIds).toContain("edge-root-a1");
    expect(edgeIds).toContain("edge-root-a2");
    expect(edgeIds).toContain("edge-root-a4");
    // a3 se conecta al IP relacionado, NO a la raíz
    expect(edgeIds).toContain("edge-a3-a2");
    expect(edgeIds).not.toContain("edge-root-a3");
    expect(edges).toHaveLength(4);
  });

  it("sin activos → solo el nodo raíz y sin aristas", async () => {
    mockAssetsFindMany.mockResolvedValue([]);
    mockFindingsFindMany.mockResolvedValue([]);

    const res = await GET(getRequest("?projectId=p1") as never);
    const body = await res.json();
    expect(body.data.nodes).toHaveLength(1);
    expect(body.data.edges).toHaveLength(0);
  });

  it("error en withRLS → 500", async () => {
    mockAssetsFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(getRequest("?projectId=p1") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
  });
});
