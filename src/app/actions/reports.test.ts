import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { txState } = vi.hoisted(() => ({
  txState: {
    project: null as null | unknown,
    keywords: null as null | unknown[],
    rankData: null as null | unknown[],
  },
}));

const { mockWithRLS } = vi.hoisted(() => ({
  mockWithRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      query: {
        projects: {
          findFirst: vi.fn(async () => txState.project),
        },
        keywordTargets: {
          findMany: vi.fn(async () => txState.keywords ?? []),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(async () => txState.rankData ?? []),
            })),
          })),
        })),
      })),
    };
    return cb(tx);
  }),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })) },
  })),
}));

vi.mock("@/shared/db/rls", () => ({ withRLS: mockWithRLS }));
vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: vi.fn(async () => txState.project),
      },
      keywordTargets: {
        findMany: vi.fn(async () => txState.keywords ?? []),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => txState.rankData ?? []),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  keywordTargets: { id: "id", projectId: "projectId", keyword: "keyword", location: "location", device: "device", targetUrl: "targetUrl" },
  rankHistory: { keywordId: "keywordId", checkedAt: "checkedAt", position: "position", searchVolume: "searchVolume", cpc: "cpc" },
  projects: { id: "id", ownerId: "ownerId", name: "name", domain: "domain" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

// ─── Test constants ─────────────────────────────────────────────────────────
const PROJECT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const MISSING_PROJECT_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

// ─── Import under test ──────────────────────────────────────────────────────
import { exportKeywordsCSV } from "./reports";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("reports server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "true");

    txState.project = null;
    txState.keywords = null;
    txState.rankData = null;
  });

  it("throws when project not found or not owned", async () => {
    txState.project = null;

    const result = await exportKeywordsCSV({ projectId: MISSING_PROJECT_ID });
    expect(result.error).toContain("Proyecto no encontrado o no autorizado");
  });

  it("returns CSV with headers only when no keywords exist", async () => {
    txState.project = { id: PROJECT_ID, ownerId: "u1", name: "Test", domain: "test.com" };
    txState.keywords = [];
    txState.rankData = [];

    const result = await exportKeywordsCSV({ projectId: PROJECT_ID });

    expect(result.data?.success).toBe(true);
    expect(result.data?.csv).toContain("Keyword,Location,Device");
    expect(result.data?.csv).toContain("Latest Position,Search Volume,CPC");
    expect(result.data?.filename).toContain("keywords_");
  });

  it("exports keywords with rank data as CSV rows", async () => {
    txState.project = { id: PROJECT_ID, ownerId: "u1", name: "Test", domain: "test.com" };
    txState.keywords = [
      { id: "k1", keyword: "seo", location: "US", device: "desktop", targetUrl: "https://test.com/seo" },
      { id: "k2", keyword: "audit", location: "ES", device: "mobile", targetUrl: "https://test.com/audit" },
    ];
    txState.rankData = [
      { keyword: "seo", location: "US", device: "desktop", targetUrl: "https://test.com/seo", position: 3, searchVolume: 1000, cpc: "1.50" },
      { keyword: "seo", location: "US", device: "desktop", targetUrl: "https://test.com/seo", position: 5, searchVolume: 800, cpc: "1.20" },
      { keyword: "audit", location: "ES", device: "mobile", targetUrl: "https://test.com/audit", position: 12, searchVolume: 500, cpc: "0.80" },
    ];

    const result = await exportKeywordsCSV({ projectId: PROJECT_ID });

    expect(result.data?.success).toBe(true);
    const csv = result.data?.csv ?? "";
    const lines = csv.split("\n");
    // Header + 2 keywords (deduplicated by keyword, latest checkedAt first)
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("Keyword");
    expect(csv).toContain("seo");
    expect(csv).toContain("audit");
    expect(result.data?.filename).toContain("test.com");
  });

  it("escapes double quotes in CSV fields", async () => {
    txState.project = { id: PROJECT_ID, ownerId: "u1", name: "Test", domain: "test.com" };
    txState.keywords = [
      { id: "k1", keyword: 'say "hello"', location: null, device: null, targetUrl: null },
    ];
    txState.rankData = [
      { keyword: 'say "hello"', location: null, device: null, targetUrl: null, position: 1, searchVolume: null, cpc: null },
    ];

    const result = await exportKeywordsCSV({ projectId: PROJECT_ID });

    expect(result.data?.success).toBe(true);
    expect(result.data?.csv).toContain('say ""hello""');
  });

  it("handles null values in CSV fields", async () => {
    txState.project = { id: PROJECT_ID, ownerId: "u1", name: "Test", domain: "test.com" };
    txState.keywords = [
      { id: "k1", keyword: "test", location: null, device: null, targetUrl: null },
    ];
    txState.rankData = [
      { keyword: "test", location: null, device: null, targetUrl: null, position: null, searchVolume: null, cpc: null },
    ];

    const result = await exportKeywordsCSV({ projectId: PROJECT_ID });

    expect(result.data?.success).toBe(true);
    const csv = result.data?.csv ?? "";
    // null values should be escaped as ""
    expect(csv).toContain('""');
  });

  it("validates projectId schema (rejects non-uuid)", async () => {
    const result = await exportKeywordsCSV({ projectId: "not-valid" } as never);
    expect(result.error).toBeTruthy();
  });
});
