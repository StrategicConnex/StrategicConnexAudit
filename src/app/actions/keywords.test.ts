import { describe, it, expect, vi, beforeEach } from "vitest";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-a222-222222222222";
const KEYWORD_ID = "33333333-3333-4333-b333-333333333333";
const COMPETITOR_ID = "44444444-4444-4444-a444-444444444444";
const UUID_NOT_FOUND = "00000000-0000-4000-8000-000000000099";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { txState } = vi.hoisted(() => ({
  txState: {
    projectsFind: null as null | unknown,
    keywordTargetsFindMany: null as null | unknown[],
    rankHistoryFindFirst: null as null | unknown,
    gscTotals: null as null | unknown,
    competitorsFindMany: null as null | unknown[],
    keywordTargetFindFirst: null as null | unknown,
    competitorFindFirst: null as null | unknown,
    insertReturning: null as null | unknown[],
  },
}));

const { mockRevalidatePath, mockRequirePermission, mockGetProjectRole } =
  vi.hoisted(() => ({
    mockRevalidatePath: vi.fn(),
    mockRequirePermission: vi.fn<() => Promise<string | null>>(async () => null),
    mockGetProjectRole: vi.fn(async () => "owner"),
  }));

const { mockWithRLS } = vi.hoisted(() => ({
  mockWithRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      query: {
        projects: {
          findFirst: vi.fn(async () => txState.projectsFind),
        },
        keywordTargets: {
          findMany: vi.fn(async () => txState.keywordTargetsFindMany ?? []),
          findFirst: vi.fn(async () => txState.keywordTargetFindFirst),
        },
        rankHistory: {
          findFirst: vi.fn(async () => txState.rankHistoryFindFirst),
        },
        competitors: {
          findMany: vi.fn(async () => txState.competitorsFindMany ?? []),
          findFirst: vi.fn(async () => txState.competitorFindFirst),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => txState.gscTotals ?? [{}]),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => txState.insertReturning ?? []),
          })),
          onConflictDoUpdate: vi.fn(async () => undefined),
          returning: vi.fn(async () => txState.insertReturning ?? []),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    };
    return cb(tx);
  }),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
  })),
}));

vi.mock("@/shared/db/rls", () => ({ withRLS: mockWithRLS }));
vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: vi.fn(async () => txState.projectsFind),
      },
      keywordTargets: {
        findMany: vi.fn(async () => txState.keywordTargetsFindMany ?? []),
        findFirst: vi.fn(async () => txState.keywordTargetFindFirst),
      },
      rankHistory: {
        findFirst: vi.fn(async () => txState.rankHistoryFindFirst),
      },
      competitors: {
        findMany: vi.fn(async () => txState.competitorsFindMany ?? []),
        findFirst: vi.fn(async () => txState.competitorFindFirst),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => txState.gscTotals ?? [{}]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => txState.insertReturning ?? []),
        })),
        onConflictDoUpdate: vi.fn(async () => undefined),
        returning: vi.fn(async () => txState.insertReturning ?? []),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  keywordTargets: { id: "id", projectId: "projectId", keyword: "keyword", createdAt: "createdAt" },
  rankHistory: { keywordId: "keywordId", checkedAt: "checkedAt", position: "position", searchVolume: "searchVolume" },
  competitors: { id: "id", projectId: "projectId", domain: "domain", name: "name", createdAt: "createdAt" },
  projects: { id: "id", ownerId: "ownerId", name: "name" },
  integrationDataGsc: { projectId: "projectId", impressions: "impressions", clicks: "clicks", ctr: "ctr", position: "position" },
}));

vi.mock("@/server/lib/project-access", () => ({
  requireProjectPermission: mockRequirePermission,
  getProjectRole: mockGetProjectRole,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/shared/utils/domain", () => ({
  normalizeDomain: vi.fn((d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]),
}));

// ─── Import under test ──────────────────────────────────────────────────────
import {
  listKeywordData,
  addKeywordTarget,
  removeKeywordTarget,
  importKeywordCsv,
  addCompetitor,
  removeCompetitor,
} from "./keywords";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("keywords server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "true");

    txState.projectsFind = null;
    txState.keywordTargetsFindMany = null;
    txState.rankHistoryFindFirst = null;
    txState.gscTotals = null;
    txState.competitorsFindMany = null;
    txState.keywordTargetFindFirst = null;
    txState.competitorFindFirst = null;
    txState.insertReturning = null;
  });

  // ── listKeywordData ──────────────────────────────────────────────────────

  describe("listKeywordData", () => {
    it("returns keywords, GSC totals and competitors for owner", async () => {
      txState.projectsFind = { id: PROJECT_ID, ownerId: USER_ID, name: "My Project" };
      txState.keywordTargetsFindMany = [
        { id: KEYWORD_ID, keyword: "seo", createdAt: new Date() },
        { id: UUID_NOT_FOUND, keyword: "audit", createdAt: new Date() },
      ];
      txState.rankHistoryFindFirst = { position: 5, searchVolume: 1000 };
      txState.gscTotals = [{ impressions: 5000, clicks: 200, ctr: 0.04, position: 12 }];
      txState.competitorsFindMany = [
        { id: COMPETITOR_ID, domain: "rival.com", name: "Rival" },
      ];

      const result = await listKeywordData({ projectId: PROJECT_ID });
      const data = result.data as { success: true; keywords: Array<{ keyword: string; position: number | null; volume: number | null }>; gsc: { impressions: number; hasData: boolean }; competitors: Array<{ domain: string }> };

      expect(data.success).toBe(true);
      expect(data.keywords).toHaveLength(2);
      expect(data.keywords[0]!.keyword).toBe("seo");
      expect(data.keywords[0]!.position).toBe(5);
      expect(data.keywords[0]!.volume).toBe(1000);
      expect(data.gsc.impressions).toBe(5000);
      expect(data.gsc.hasData).toBe(true);
      expect(data.competitors).toHaveLength(1);
      expect(data.competitors[0]!.domain).toBe("rival.com");
    });

    it("returns error when project not owned", async () => {
      txState.projectsFind = null;

      const result = await listKeywordData({ projectId: PROJECT_ID });
      expect(result.data).toEqual({ error: "Proyecto no encontrado" });
    });

    it("handles empty keyword list", async () => {
      txState.projectsFind = { id: PROJECT_ID, ownerId: USER_ID, name: "Empty" };
      txState.keywordTargetsFindMany = [];
      txState.gscTotals = [{ impressions: 0, clicks: 0, ctr: null, position: null }];
      txState.competitorsFindMany = [];

      const result = await listKeywordData({ projectId: PROJECT_ID });
      const data = result.data as { success: true; keywords: unknown[]; gsc: { hasData: boolean } };
      expect(data.success).toBe(true);
      expect(data.keywords).toHaveLength(0);
      expect(data.gsc.hasData).toBe(false);
    });
  });

  // ── addKeywordTarget ─────────────────────────────────────────────────────

  describe("addKeywordTarget", () => {
    it("adds keyword with normalized lowercase", async () => {
      mockRequirePermission.mockResolvedValue(null);

      const result = await addKeywordTarget({ projectId: PROJECT_ID, keyword: " SEO Tool " });
      expect(result.data?.success).toBe(true);
      expect((result.data as { keyword: string }).keyword).toBe("seo tool");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("returns permission error when denied", async () => {
      mockRequirePermission.mockResolvedValue("No tienes permiso");

      const result = await addKeywordTarget({ projectId: PROJECT_ID, keyword: "test" });
      expect(result.data).toEqual({ error: "No tienes permiso" });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  // ── removeKeywordTarget ──────────────────────────────────────────────────

  describe("removeKeywordTarget", () => {
    it("removes keyword when found and permitted", async () => {
      txState.keywordTargetFindFirst = { id: KEYWORD_ID, projectId: PROJECT_ID };
      mockRequirePermission.mockResolvedValue(null);

      const result = await removeKeywordTarget({ id: KEYWORD_ID });
      expect(result.data?.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("returns error when keyword not found", async () => {
      txState.keywordTargetFindFirst = null;

      const result = await removeKeywordTarget({ id: UUID_NOT_FOUND });
      expect(result.data).toEqual({ error: "Keyword no encontrada" });
    });

    it("returns permission error when denied", async () => {
      txState.keywordTargetFindFirst = { id: KEYWORD_ID, projectId: PROJECT_ID };
      mockRequirePermission.mockResolvedValue("Sin permiso");

      const result = await removeKeywordTarget({ id: KEYWORD_ID });
      expect(result.data).toEqual({ error: "Sin permiso" });
    });
  });

  // ── importKeywordCsv ─────────────────────────────────────────────────────

  describe("importKeywordCsv", () => {
    it("imports keywords with positions", async () => {
      mockRequirePermission.mockResolvedValue(null);
      txState.insertReturning = [{ id: KEYWORD_ID }];

      const result = await importKeywordCsv({
        projectId: PROJECT_ID,
        rows: [
          { keyword: "seo", position: 3, date: "2025-01-15" },
          { keyword: "audit", position: 10 },
        ],
      });

      const data = result.data as { success: true; targets: number; imported: number };
      expect(data.success).toBe(true);
      expect(data.targets).toBe(2);
      expect(data.imported).toBe(2);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("returns permission error when denied", async () => {
      mockRequirePermission.mockResolvedValue("No puedes");

      const result = await importKeywordCsv({
        projectId: PROJECT_ID,
        rows: [{ keyword: "test" }],
      });
      expect(result.data).toEqual({ error: "No puedes" });
    });

    it("handles row with no position (target only, no rank)", async () => {
      mockRequirePermission.mockResolvedValue(null);
      txState.insertReturning = [{ id: KEYWORD_ID }];

      const result = await importKeywordCsv({
        projectId: PROJECT_ID,
        rows: [{ keyword: "brand" }],
      });

      const data = result.data as { success: true; targets: number; imported: number };
      expect(data.success).toBe(true);
      expect(data.targets).toBe(1);
      expect(data.imported).toBe(0);
    });

    it("resolves the existing target when the insert conflicts", async () => {
      mockRequirePermission.mockResolvedValue(null);
      txState.insertReturning = [];
      txState.keywordTargetFindFirst = { id: KEYWORD_ID, projectId: PROJECT_ID, keyword: "seo" };

      const result = await importKeywordCsv({
        projectId: PROJECT_ID,
        rows: [{ keyword: "seo", position: 7 }],
      });

      const data = result.data as { success: true; targets: number; imported: number };
      expect(data.success).toBe(true);
      expect(data.targets).toBe(1);
      expect(data.imported).toBe(1);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("skips rows that cannot resolve any target id", async () => {
      mockRequirePermission.mockResolvedValue(null);
      txState.insertReturning = [];
      txState.keywordTargetFindFirst = null;

      const result = await importKeywordCsv({
        projectId: PROJECT_ID,
        rows: [{ keyword: "ghost", position: 4 }],
      });

      const data = result.data as { success: true; targets: number; imported: number };
      expect(data.success).toBe(true);
      expect(data.targets).toBe(0);
      expect(data.imported).toBe(0);
    });
  });

  // ── addCompetitor ────────────────────────────────────────────────────────

  describe("addCompetitor", () => {
    it("adds competitor with normalized domain", async () => {
      mockRequirePermission.mockResolvedValue(null);

      const result = await addCompetitor({ projectId: PROJECT_ID, domain: " https://Rival.com/path " });
      expect(result.data?.success).toBe(true);
      expect((result.data as { domain: string }).domain).toBe("rival.com");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("returns permission error when denied", async () => {
      mockRequirePermission.mockResolvedValue("No access");

      const result = await addCompetitor({ projectId: PROJECT_ID, domain: "rival.com" });
      expect(result.data).toEqual({ error: "No access" });
    });
  });

  // ── removeCompetitor ─────────────────────────────────────────────────────

  describe("removeCompetitor", () => {
    it("removes competitor when found and permitted", async () => {
      txState.competitorFindFirst = { id: COMPETITOR_ID, projectId: PROJECT_ID };
      mockRequirePermission.mockResolvedValue(null);

      const result = await removeCompetitor({ id: COMPETITOR_ID });
      expect(result.data?.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    });

    it("returns error when competitor not found", async () => {
      txState.competitorFindFirst = null;

      const result = await removeCompetitor({ id: UUID_NOT_FOUND });
      expect(result.data).toEqual({ error: "Competidor no encontrado" });
    });

    it("returns permission error when denied", async () => {
      txState.competitorFindFirst = { id: COMPETITOR_ID, projectId: PROJECT_ID };
      mockRequirePermission.mockResolvedValue("Denied");

      const result = await removeCompetitor({ id: COMPETITOR_ID });
      expect(result.data).toEqual({ error: "Denied" });
    });
  });
});
