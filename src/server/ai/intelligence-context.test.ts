import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectFindFirst = vi.fn();
const mockInvestigationFindFirst = vi.fn();
const mockFindingsFindMany = vi.fn();
const mockFindingFindFirst = vi.fn();
const mockWithRLS = vi.fn();

vi.mock("@/shared/db/rls", () => ({
  withRLS: (...args: unknown[]) => mockWithRLS(...args),
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";
const FINDING_ID = "33333333-3333-4333-8333-333333333333";

function createTx() {
  return {
    query: {
      projects: { findFirst: mockProjectFindFirst },
      intelligenceInvestigations: { findFirst: mockInvestigationFindFirst },
      intelligenceFindings: { findMany: mockFindingsFindMany, findFirst: mockFindingFindFirst },
    },
  };
}

describe("loadIntelligenceCopilotContext", () => {
  let loadIntelligenceCopilotContext: typeof import("./intelligence-context").loadIntelligenceCopilotContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWithRLS.mockImplementation(async (_userId: string, callback: (tx: unknown) => unknown) =>
      callback(createTx()),
    );
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT_ID, name: "Acme", domain: "acme.test" });
    mockInvestigationFindFirst.mockResolvedValue({
      id: INVESTIGATION_ID,
      target: "acme.test",
      targetType: "domain",
      status: "completed",
      score: 61,
      summary: "Summary",
    });
    mockFindingsFindMany.mockResolvedValue([{ id: "finding-1", title: "SPF ausente" }]);
    mockFindingFindFirst.mockResolvedValue({
      id: FINDING_ID,
      investigationId: INVESTIGATION_ID,
      title: "DMARC ausente",
    });
    ({ loadIntelligenceCopilotContext } = await import("./intelligence-context"));
  });

  it("returns an empty context without querying when there are no active IDs", async () => {
    await expect(loadIntelligenceCopilotContext("user-1", {})).resolves.toEqual({
      projects: [],
      summary: { totalProjects: 0 },
      investigation: null,
      findings: [],
    });
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("resolves project and matching investigation only inside the caller's RLS scope", async () => {
    const context = await loadIntelligenceCopilotContext("user-1", {
      projectId: PROJECT_ID,
      investigationId: INVESTIGATION_ID,
    });

    expect(mockWithRLS).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(mockProjectFindFirst).toHaveBeenCalledOnce();
    expect(mockInvestigationFindFirst).toHaveBeenCalledOnce();
    expect(mockFindingsFindMany).toHaveBeenCalledOnce();

    const findingQuery = mockFindingsFindMany.mock.calls[0][0];
    expect(findingQuery.limit).toBe(25);
    expect(findingQuery.orderBy).toHaveLength(1);
    expect(findingQuery.where).toBeDefined();
    expect(context).toMatchObject({
      project: { id: PROJECT_ID, name: "Acme", domain: "acme.test" },
      investigation: { id: INVESTIGATION_ID, score: 61 },
      findings: [{ id: "finding-1", title: "SPF ausente" }],
    });
  });

  it("conflates a missing or inaccessible project with not found and does not query findings", async () => {
    mockProjectFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      loadIntelligenceCopilotContext("user-1", { projectId: PROJECT_ID }),
    ).resolves.toBeNull();
    expect(mockFindingsFindMany).not.toHaveBeenCalled();
  });

  it("rejects an investigation that is missing or does not belong to the requested project", async () => {
    mockInvestigationFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      loadIntelligenceCopilotContext("user-1", {
        projectId: PROJECT_ID,
        investigationId: INVESTIGATION_ID,
      }),
    ).resolves.toBeNull();
    expect(mockFindingsFindMany).not.toHaveBeenCalled();
  });

  it("does not resolve an investigation without a project scope", async () => {
    await expect(
      loadIntelligenceCopilotContext("user-1", { investigationId: INVESTIGATION_ID }),
    ).resolves.toBeNull();
    expect(mockWithRLS).not.toHaveBeenCalled();
  });

  it("resuelve /finding por ID dentro del proyecto autorizado", async () => {
    const context = await loadIntelligenceCopilotContext("user-1", {
      projectId: PROJECT_ID,
      investigationId: INVESTIGATION_ID,
      findingId: FINDING_ID,
    });

    expect(mockFindingFindFirst).toHaveBeenCalledOnce();
    expect(context).toMatchObject({
      project: { id: PROJECT_ID },
      selectedFinding: { id: FINDING_ID, title: "DMARC ausente" },
    });
  });

  it("conflatea un hallazgo ajeno o inexistente con not found y no lista hallazgos", async () => {
    mockFindingFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      loadIntelligenceCopilotContext("user-1", {
        projectId: PROJECT_ID,
        findingId: FINDING_ID,
      }),
    ).resolves.toBeNull();
    expect(mockFindingsFindMany).not.toHaveBeenCalled();
  });

  it("rechaza un hallazgo que no pertenece a la investigación indicada", async () => {
    mockFindingFindFirst.mockResolvedValueOnce(undefined);

    await expect(
      loadIntelligenceCopilotContext("user-1", {
        projectId: PROJECT_ID,
        investigationId: INVESTIGATION_ID,
        findingId: FINDING_ID,
      }),
    ).resolves.toBeNull();
    expect(mockFindingsFindMany).not.toHaveBeenCalled();
  });

  it("no resuelve un hallazgo sin proyecto", async () => {
    await expect(
      loadIntelligenceCopilotContext("user-1", { findingId: FINDING_ID }),
    ).resolves.toBeNull();
    expect(mockWithRLS).not.toHaveBeenCalled();
  });
});
