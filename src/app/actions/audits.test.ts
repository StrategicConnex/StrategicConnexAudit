import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-a222-222222222222";
const AUDIT_ID = "33333333-3333-4333-b333-333333333333";
const OTHER_USER = "44444444-4444-4444-c444-444444444444";
const DEV_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { txState, ddState, selectCallCount } = vi.hoisted(() => ({
  txState: {
    projectsFind: null as null | unknown[],
    recentAudits: null as null | unknown[],
    insertAudit: null as null | unknown[],
    selectJoin: null as null | unknown[],
  },
  ddState: {
    updateResult: null as null | unknown[],
    selectResult: null as null | unknown[],
    insertResult: null as null | unknown[],
  },
  selectCallCount: { count: 0 },
}));

const { mockTasksTrigger, mockLoggerWarn, mockLoggerInfo, mockLoggerError } =
  vi.hoisted(() => ({
    mockTasksTrigger: vi.fn(),
    mockLoggerWarn: vi.fn(async () => undefined),
    mockLoggerInfo: vi.fn(async () => undefined),
    mockLoggerError: vi.fn(async () => undefined),
  }));

const { mockValidateSafeUrl, mockNormalizeUrl } = vi.hoisted(() => ({
  mockValidateSafeUrl: vi.fn(async () => undefined),
  mockNormalizeUrl: vi.fn((url: string) => url),
}));

const { mockWithRLS } = vi.hoisted(() => ({
  mockWithRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () =>
              txState.selectJoin ?? txState.projectsFind ?? []
            ),
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => txState.selectJoin ?? []),
              })),
            })),
          })),
        })),
        fields: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () =>
                txState.selectJoin ?? txState.projectsFind ?? []
              ),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => txState.insertAudit ?? []),
          })),
          returning: vi.fn(async () => txState.insertAudit ?? []),
        })),
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
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => ddState.updateResult ?? []),
        returning: vi.fn(async () => ddState.updateResult ?? []),
      })),
    })),
    select: vi.fn(() => {
      const callIndex = selectCallCount.count++;
      const isAuditQuery = callIndex % 2 === 1;
      const whereResult = {
        limit: vi.fn(async () => isAuditQuery
          ? (txState.recentAudits ?? [])
          : (txState.projectsFind ?? ddState.selectResult ?? [])),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => txState.selectJoin ?? ddState.selectResult ?? []),
          })),
          limit: vi.fn(async () => txState.selectJoin ?? ddState.selectResult ?? []),
        })),
      };
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => whereResult),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => txState.insertAudit ?? ddState.insertResult ?? []),
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => txState.insertAudit ?? ddState.insertResult ?? []),
        })),
      })),
    })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  audits: { id: "id", projectId: "projectId", status: "status", createdAt: "createdAt", startedAt: "startedAt", createdBy: "createdBy", errorMessage: "errorMessage", completedAt: "completedAt", type: "type" },
  projects: { id: "id", ownerId: "ownerId", domain: "domain", name: "name" },
  crawlResults: { auditId: "auditId" },
  issues: { projectId: "projectId", auditId: "auditId" },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    security: vi.fn(async () => undefined),
  },
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: mockTasksTrigger },
}));

vi.mock("@/trigger/audit.trigger", () => ({}));

vi.mock("@/server/intelligence/security/egress-guard", () => ({
  validateSafeUrl: mockValidateSafeUrl,
  normalizeUrl: mockNormalizeUrl,
}));

// ─── Import under test ──────────────────────────────────────────────────────
import { triggerAudit, getAuditStatus, startAuditAction } from "./audits";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("audits server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_BYPASS_AUTH", "true");

    txState.projectsFind = null;
    txState.recentAudits = null;
    txState.insertAudit = null;
    txState.selectJoin = null;
    ddState.updateResult = null;
    ddState.selectResult = null;
    ddState.insertResult = null;
    selectCallCount.count = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── triggerAudit ─────────────────────────────────────────────────────────

  describe("triggerAudit", () => {
    it("creates audit when project exists and no recent audit", async () => {
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [];
      txState.insertAudit = [{ id: AUDIT_ID }];

      const result = await triggerAudit({ projectId: PROJECT_ID });

      expect(result.data?.success).toBe(true);
      expect(result.data?.auditId).toBe(AUDIT_ID);
      expect(result.data?.projectId).toBe(PROJECT_ID);
      expect(result.data?.userId).toBe(DEV_BYPASS_USER_ID);
    });

    it("throws when project not found or access denied", async () => {
      txState.projectsFind = [];
      txState.recentAudits = [];

      const result = await triggerAudit({ projectId: PROJECT_ID });
      expect(result.error).toContain("Project not found or access denied");
    });

    it("returns rate-limit message when recent audit exists", async () => {
      const recentTime = new Date(Date.now() - 5000);
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [{ id: "a-recent", createdAt: recentTime }];

      const result = await triggerAudit({ projectId: PROJECT_ID });

      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toContain("Espera");
    });

    it("propagates validation error for invalid projectId", async () => {
      const result = await triggerAudit({ projectId: "not-a-uuid" } as never);
      expect(result.error).toBeTruthy();
    });
  });

  // ── getAuditStatus ───────────────────────────────────────────────────────

  describe("getAuditStatus", () => {
    it("returns audit status for owned project", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "completed", errorMessage: null, startedAt: new Date() },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(true);
      expect(result.data?.status).toBe("completed");
    });

    it("returns error when audit not found", async () => {
      txState.selectJoin = [];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toContain("no encontrada");
    });

    it("throws when user is not project owner", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "completed", errorMessage: null, startedAt: new Date() },
        project: { id: PROJECT_ID, ownerId: OTHER_USER },
      }];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.error).toContain("Acceso denegado");
    });

    it("expires pending audit stuck for more than 3 minutes (watchdog)", async () => {
      const oldTime = new Date(Date.now() - 200_000);
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "pending", errorMessage: null, startedAt: oldTime },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];
      ddState.updateResult = [];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(true);
      expect(result.data?.status).toBe("failed");
      expect(result.data?.errorMessage).toContain("worker no disponible");
    });

    it("does not expire pending audit within 3 minutes", async () => {
      const recentTime = new Date(Date.now() - 60_000);
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "pending", errorMessage: null, startedAt: recentTime },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(true);
      expect(result.data?.status).toBe("pending");
    });
  });

  // ── startAuditAction ─────────────────────────────────────────────────────

  describe("startAuditAction", () => {
    it("triggers task on success", async () => {
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [];
      txState.insertAudit = [{ id: AUDIT_ID }];
      mockTasksTrigger.mockResolvedValue({});

      const result = await startAuditAction({ projectId: PROJECT_ID });

      expect(result.data?.success).toBe(true);
      expect(result.data?.auditId).toBe(AUDIT_ID);
      expect(mockTasksTrigger).toHaveBeenCalledWith(
        "run-project-audit",
        expect.objectContaining({ projectId: PROJECT_ID, auditId: AUDIT_ID })
      );
    });

    it("falls back to runLocalAudit when task.trigger throws", async () => {
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [];
      txState.insertAudit = [{ id: AUDIT_ID }];
      mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev offline"));

      ddState.updateResult = [{ id: AUDIT_ID }];
      ddState.selectResult = [{ id: PROJECT_ID, ownerId: USER_ID, domain: "https://acme.com" }];
      ddState.insertResult = [];

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response("<html><body><h1>Hi</h1></body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        )
      );

      const result = await startAuditAction({ projectId: PROJECT_ID });

      expect(result.data?.success).toBe(true);
      expect(result.data?.auditId).toBe(AUDIT_ID);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Trigger.dev"),
        expect.anything()
      );
    });

    it("returns error when triggerAudit fails (no task trigger)", async () => {
      txState.projectsFind = [];
      txState.recentAudits = [];

      const result = await startAuditAction({ projectId: PROJECT_ID });
      expect(result.error).toContain("Project not found or access denied");
      expect(mockTasksTrigger).not.toHaveBeenCalled();
    });

    it("returns rate-limit message when triggered too fast", async () => {
      const recentTime = new Date(Date.now() - 3000);
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [{ id: "a-recent", createdAt: recentTime }];

      const result = await startAuditAction({ projectId: PROJECT_ID });
      expect(result.data?.success).toBe(false);
      expect(mockTasksTrigger).not.toHaveBeenCalled();
    });
  });
});
