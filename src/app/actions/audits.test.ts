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
    throwOnWhereLimit: false,
  },
  ddState: {
    updateResult: null as null | unknown[],
    selectResult: null as null | unknown[],
    insertResult: null as null | unknown[],
    localSelectResult: undefined as unknown[] | null | undefined,
    updateCall: 0,
    updateThrowOnCall: null as null | number,
    updatedPayloads: [] as unknown[],
    insertedPayloads: [] as unknown[],
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
      set: vi.fn((payload: unknown) => {
        ddState.updatedPayloads.push(payload);
        return {
          where: vi.fn(() => {
            ddState.updateCall += 1;
            const result = (async () => {
              if (ddState.updateThrowOnCall === ddState.updateCall) {
                throw new Error("db write failed");
              }
              return ddState.updateResult ?? [];
            })();
            // A call chain `.set().where().returning()` needs a thenable that
            // also exposes `.returning()`; `.set().where()` just needs await.
            return Object.assign(result, { returning: vi.fn(() => result) });
          }),
        };
      }),
    })),
    select: vi.fn(() => {
      const callIndex = selectCallCount.count++;
      const isAuditQuery = callIndex % 2 === 1;
      const whereResult = {
        limit: vi.fn(async () => {
          if (txState.throwOnWhereLimit) throw new Error("count query failed");
          if (ddState.localSelectResult !== undefined && callIndex >= 2) {
            return ddState.localSelectResult;
          }
          return isAuditQuery
            ? (txState.recentAudits ?? [])
            : (txState.projectsFind ?? ddState.selectResult ?? []);
        }),
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
      values: vi.fn((payload: unknown) => {
        ddState.insertedPayloads.push(payload);
        return {
          returning: vi.fn(async () => txState.insertAudit ?? ddState.insertResult ?? []),
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => txState.insertAudit ?? ddState.insertResult ?? []),
          })),
        };
      }),
    })),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  audits: { id: "id", projectId: "projectId", status: "status", createdAt: "createdAt", startedAt: "startedAt", createdBy: "createdBy", errorMessage: "errorMessage", completedAt: "completedAt", type: "type" },
  projects: { id: "id", ownerId: "ownerId", domain: "domain", name: "name" },
  crawlResults: { auditId: "auditId" },
  issues: { id: "id", projectId: "projectId", auditId: "auditId", fixed: "fixed", updatedAt: "updatedAt" },
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
import { triggerAudit, getAuditStatus, startAuditAction, cancelAuditAction, toggleIssueFixed } from "./audits";

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
    txState.throwOnWhereLimit = false;
    ddState.updateResult = null;
    ddState.selectResult = null;
    ddState.insertResult = null;
    ddState.localSelectResult = undefined;
    ddState.updateCall = 0;
    ddState.updateThrowOnCall = null;
    ddState.updatedPayloads = [];
    ddState.insertedPayloads = [];
    selectCallCount.count = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

    it("accepts custom type/depth/userAgent (Semana 7 config)", async () => {
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: USER_ID }];
      txState.recentAudits = [];
      txState.insertAudit = [{ id: AUDIT_ID }];

      const result = await triggerAudit({
        projectId: PROJECT_ID,
        type: "technical",
        depth: 5,
        userAgent: "TestBot/1.0",
      });

      expect(result.data?.success).toBe(true);
      expect(result.data?.auditId).toBe(AUDIT_ID);
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

    it("includes pagesScanned as a number (Semana 7 stat)", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "running", errorMessage: null, startedAt: new Date() },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];

      const result = await getAuditStatus({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(true);
      expect(typeof result.data?.pagesScanned).toBe("number");
    });

    it("keeps polling alive when the pagesScanned count query fails", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "running", errorMessage: null, startedAt: new Date() },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];
      txState.throwOnWhereLimit = true;

      const result = await getAuditStatus({ auditId: AUDIT_ID });

      expect(result.data?.success).toBe(true);
      expect(result.data?.status).toBe("running");
      expect(result.data?.pagesScanned).toBe(0);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "pagesScanned no disponible",
        expect.objectContaining({ auditId: AUDIT_ID })
      );
    });
  });

  // ── cancelAuditAction (Semana 7) ───────────────────────────────────────────

  describe("cancelAuditAction", () => {
    it("cancels a running audit owned by the user", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "running", errorMessage: null },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];
      ddState.updateResult = [{ id: AUDIT_ID }];

      const result = await cancelAuditAction({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(true);
      expect(result.data?.status).toBe("canceled");
    });

    it("refuses an already terminal audit", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "completed", errorMessage: null },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];

      const result = await cancelAuditAction({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toContain("ya terminó");
    });

    it("returns error when audit not found", async () => {
      txState.selectJoin = [];

      const result = await cancelAuditAction({ auditId: AUDIT_ID });
      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toContain("no encontrada");
    });

    it("throws when user is not project owner", async () => {
      txState.selectJoin = [{
        audit: { id: AUDIT_ID, status: "running", errorMessage: null },
        project: { id: PROJECT_ID, ownerId: OTHER_USER },
      }];

      const result = await cancelAuditAction({ auditId: AUDIT_ID });
      expect(result.error).toContain("Acceso denegado");
    });

    it("propagates validation error for invalid auditId", async () => {
      const result = await cancelAuditAction({ auditId: "not-a-uuid" } as never);
      expect(result.error).toBeTruthy();
    });
  });

  // ── toggleIssueFixed (Semana 8) ────────────────────────────────────────────

  describe("toggleIssueFixed", () => {
    const ISSUE_ID = "55555555-5555-4555-8555-555555555555";

    it("marks an owned issue as fixed", async () => {
      txState.selectJoin = [{
        issue: { id: ISSUE_ID, fixed: false },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];
      ddState.updateResult = [{ id: ISSUE_ID }];

      const result = await toggleIssueFixed({ issueId: ISSUE_ID, fixed: true });
      expect(result.data?.success).toBe(true);
      expect(result.data?.fixed).toBe(true);
    });

    it("reopens a fixed issue", async () => {
      txState.selectJoin = [{
        issue: { id: ISSUE_ID, fixed: true },
        project: { id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID },
      }];
      ddState.updateResult = [{ id: ISSUE_ID }];

      const result = await toggleIssueFixed({ issueId: ISSUE_ID, fixed: false });
      expect(result.data?.success).toBe(true);
      expect(result.data?.fixed).toBe(false);
    });

    it("returns error when issue not found", async () => {
      txState.selectJoin = [];

      const result = await toggleIssueFixed({ issueId: ISSUE_ID, fixed: true });
      expect(result.data?.success).toBe(false);
      expect(result.data?.message).toContain("no encontrado");
    });

    it("throws when user is not project owner", async () => {
      txState.selectJoin = [{
        issue: { id: ISSUE_ID, fixed: false },
        project: { id: PROJECT_ID, ownerId: OTHER_USER },
      }];

      const result = await toggleIssueFixed({ issueId: ISSUE_ID, fixed: true });
      expect(result.error).toContain("Acceso denegado");
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
      // runLocalAudit corre en background: el owner no coincide con el usuario
      // dev, así que el fallback falla por "Acceso denegado". Esperamos a que
      // termine para no arrastrar estado al siguiente test.
      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith("LocalAudit error", expect.anything())
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

  // ── runLocalAudit + analyzeUrl (fallback local de startAuditAction) ────────

  describe("startAuditAction local fallback (runLocalAudit)", () => {
    const armFallback = () => {
      txState.projectsFind = [{ id: PROJECT_ID, ownerId: DEV_BYPASS_USER_ID, domain: "https://acme.com" }];
      txState.recentAudits = [];
      txState.insertAudit = [{ id: AUDIT_ID }];
      ddState.updateResult = [{ id: AUDIT_ID }];
      mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev offline"));
    };

    const stubFetch = (response: () => Response) => {
      const fetchMock = vi.fn(async () => response());
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    const waitForCompletion = async () => {
      await vi.waitFor(() =>
        expect(mockLoggerInfo).toHaveBeenCalledWith("LocalAudit completada", { auditId: AUDIT_ID })
      );
    };

    const issueTitles = () =>
      ddState.insertedPayloads
        .filter((p): p is Array<{ title: string }> => Array.isArray(p))
        .flat()
        .map((issue) => issue.title);

    const updateStatuses = () =>
      ddState.updatedPayloads.map((payload) => (payload as { status?: string }).status);

    it("analyzes healthy HTML and marks the audit completed", async () => {
      armFallback();
      const words = Array.from({ length: 320 }, (_, i) => `word${i}`).join(" ");
      const fetchMock = stubFetch(
        () =>
          new Response(
            `<html><head><title>My Site</title>` +
              `<meta name="description" content="A reasonable meta description for the landing page."></head>` +
              `<body><h1>Main</h1><h2>One</h2><h2>Two</h2><p>${words}</p></body></html>`,
            { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
          )
      );

      const result = await startAuditAction({ projectId: PROJECT_ID });
      expect(result.data?.success).toBe(true);

      await waitForCompletion();

      expect(mockValidateSafeUrl).toHaveBeenCalledWith("https://acme.com");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://acme.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": expect.stringContaining("StrategicAuditBot"),
          }),
        })
      );
      expect(issueTitles()).toEqual([]);
      expect(updateStatuses()).toEqual(expect.arrayContaining(["running", "completed"]));
    });

    it("records meta/seo issues when the response is not ok", async () => {
      armFallback();
      stubFetch(
        () => new Response("boom", { status: 500, headers: { "content-type": "text/plain" } })
      );

      await startAuditAction({ projectId: PROJECT_ID });
      await waitForCompletion();

      expect(issueTitles()).toEqual(
        expect.arrayContaining(["Falta Title Tag", "Falta Meta Description", "Falta H1"])
      );
      expect(updateStatuses()).toContain("completed");
    });

    it("skips HTML parsing for non-html content types", async () => {
      armFallback();
      stubFetch(
        () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      );

      await startAuditAction({ projectId: PROJECT_ID });
      await waitForCompletion();

      expect(issueTitles()).toEqual(
        expect.arrayContaining(["Falta Title Tag", "Falta Meta Description", "Falta H1"])
      );
    });

    it("flags long title, long meta, multiple h1 and thin content", async () => {
      armFallback();
      const longTitle = "T".repeat(70);
      const longMeta = "M".repeat(170);
      stubFetch(
        () =>
          new Response(
            `<html><head><title>${longTitle}</title>` +
              `<meta content="${longMeta}" name="description"></head>` +
              `<body><h1>First</h1><h1>Second</h1><p>${"palabra ".repeat(40).trim()}</p></body></html>`,
            { status: 200, headers: { "content-type": "text/html" } }
          )
      );

      await startAuditAction({ projectId: PROJECT_ID });
      await waitForCompletion();

      expect(issueTitles()).toEqual(
        expect.arrayContaining([
          "Titulo muy largo",
          "Meta description muy larga",
          "Multiples H1",
          "Thin Content",
        ])
      );
    });

    it("marks the audit failed when the crawl fetch throws", async () => {
      armFallback();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("ECONNREFUSED");
        })
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "LocalAudit error",
          expect.objectContaining({ error: expect.stringContaining("ECONNREFUSED") })
        )
      );
      expect(updateStatuses()).toContain("failed");
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        "LocalAudit completada",
        expect.anything()
      );
    });

    it("logs fallback error when writing the failure status also fails", async () => {
      armFallback();
      ddState.updateThrowOnCall = 2;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("net down");
        })
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "LocalAudit fallback error",
          expect.objectContaining({ error: expect.any(Error) })
        )
      );
    });

    it("aborts the local run when the audit row cannot be claimed", async () => {
      armFallback();
      ddState.updateResult = [];
      const fetchMock = stubFetch(
        () => new Response("x", { status: 200, headers: { "content-type": "text/html" } })
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "LocalAudit error",
          expect.objectContaining({ error: expect.stringContaining("no encontrada") })
        )
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborts the local run when the project no longer exists", async () => {
      armFallback();
      ddState.localSelectResult = [];
      const fetchMock = stubFetch(
        () => new Response("x", { status: 200, headers: { "content-type": "text/html" } })
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "LocalAudit error",
          expect.objectContaining({ error: expect.stringContaining("no encontrado") })
        )
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborts the local run when the caller does not own the project", async () => {
      armFallback();
      ddState.localSelectResult = [
        { id: PROJECT_ID, ownerId: OTHER_USER, domain: "https://evil.example" },
      ];
      const fetchMock = stubFetch(
        () => new Response("x", { status: 200, headers: { "content-type": "text/html" } })
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "LocalAudit error",
          expect.objectContaining({ error: expect.stringContaining("Acceso denegado") })
        )
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("logs Audit fallback error when the local run rejects before its try block", async () => {
      armFallback();
      mockLoggerInfo.mockImplementationOnce(() => {
        throw new Error("logger unavailable");
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("x", { status: 200, headers: { "content-type": "text/html" } }))
      );

      await startAuditAction({ projectId: PROJECT_ID });

      await vi.waitFor(() =>
        expect(mockLoggerError).toHaveBeenCalledWith(
          "Audit fallback error",
          expect.objectContaining({ error: expect.any(Error) })
        )
      );
    });
  });
});
