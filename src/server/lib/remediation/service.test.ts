import { describe, it, expect, vi, beforeEach } from "vitest";

const dbInsertMock = vi.hoisted(() => vi.fn());
const dbSelectMock = vi.hoisted(() => vi.fn());
const dbUpdateMock = vi.hoisted(() => vi.fn());
const dbQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/db", () => ({
  directDb: {
    insert: (...args: unknown[]) => dbInsertMock(...args),
    select: (...args: unknown[]) => dbSelectMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    query: { remediationActions: { findMany: (...args: unknown[]) => dbQueryMock(...args) } },
  },
}));

vi.mock("@/shared/db/schemas/remediation", () => ({
  remediationActions: {
    projectId: "projectId",
    id: "id",
    title: "title",
    connector: "connector",
    configEncrypted: "configEncrypted",
    steps: "steps",
    status: "status",
    assessmentId: "assessmentId",
    vulnerabilityTitle: "vulnerabilityTitle",
    createdBy: "createdBy",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    result: "result",
  },
  RemediationConnector: {},
}));

vi.mock("@/server/lib/field-crypto", () => ({
  encryptField: vi.fn((val: string) => `encrypted:${val}`),
}));

vi.mock("./connectors", () => ({
  decryptConfig: vi.fn(() => ({ token: "decrypted" })),
  executeConnector: vi.fn().mockResolvedValue({ evidence: { ok: true, details: "done" } }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { listActions, proposeAction, approveAction, executeAction } from "./service";
import { encryptField } from "@/server/lib/field-crypto";
import { decryptConfig, executeConnector } from "./connectors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listActions", () => {
  it("queries remediation actions by projectId", async () => {
    const fakeActions = [{ id: "a1", title: "Fix XSS" }];
    dbQueryMock.mockResolvedValue(fakeActions);

    const result = await listActions("proj-1");
    expect(result).toEqual(fakeActions);
    expect(dbQueryMock).toHaveBeenCalled();
  });
});

describe("proposeAction", () => {
  it("inserts a new remediation action with encrypted config", async () => {
    const returningSpy = vi.fn().mockResolvedValue([{ id: "new-id" }]);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: returningSpy }),
    });

    const id = await proposeAction({
      projectId: "proj-1",
      title: "Fix SQL Injection",
      connector: "github.create_issue" as never,
      config: { token: "ghp_secret", owner: "acme", repo: "web" },
      steps: ["Step 1"],
      assessmentId: "assess-1",
      vulnerabilityTitle: "SQLi in login",
      createdBy: "user-1",
    });

    expect(id).toBe("new-id");
    expect(encryptField).toHaveBeenCalled();
  });

  it("inserts with null configEncrypted when config is empty", async () => {
    const returningSpy = vi.fn().mockResolvedValue([{ id: "new-id-2" }]);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: returningSpy }),
    });

    const id = await proposeAction({
      projectId: "proj-1",
      title: "No config action",
      connector: "cloudflare.purge_cache" as never,
      config: {},
    });

    expect(id).toBe("new-id-2");
  });

  it("throws when insert returns no row", async () => {
    const returningSpy = vi.fn().mockResolvedValue([]);
    dbInsertMock.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: returningSpy }),
    });

    await expect(
      proposeAction({
        projectId: "proj-1",
        title: "fail",
        connector: "http.request" as never,
        config: {},
      })
    ).rejects.toThrow("No se pudo crear la acción");
  });

  it("truncates title to 200 chars", async () => {
    const valuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "x" }]),
    });
    dbInsertMock.mockReturnValue({ values: valuesSpy });

    const longTitle = "A".repeat(300);
    await proposeAction({
      projectId: "proj-1",
      title: longTitle,
      connector: "http.request" as never,
      config: {},
    });

    const callArgs = valuesSpy.mock.calls[0]![0];
    expect(callArgs.title.length).toBeLessThanOrEqual(200);
  });

  it("defaults steps to empty array", async () => {
    const valuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "x" }]),
    });
    dbInsertMock.mockReturnValue({ values: valuesSpy });

    await proposeAction({
      projectId: "proj-1",
      title: "no steps",
      connector: "http.request" as never,
      config: {},
    });

    const callArgs = valuesSpy.mock.calls[0]![0];
    expect(callArgs.steps).toEqual([]);
  });
});

describe("approveAction", () => {
  it("updates status to approved when in proposed state", async () => {
    const returningSpy = vi.fn().mockResolvedValue([{ id: "a1" }]);
    dbUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningSpy }) }),
    });

    await approveAction("a1");
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it("throws when action is not in proposed state", async () => {
    const returningSpy = vi.fn().mockResolvedValue([]);
    dbUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: returningSpy }) }),
    });

    await expect(approveAction("a1")).rejects.toThrow("La acción no está en estado proposed");
  });
});

describe("executeAction", () => {
  it("throws when action not found", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    await expect(executeAction("nonexistent")).rejects.toThrow("Acción no encontrada");
  });

  it("throws when action is not in approved state", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "a1", status: "proposed" }]),
    });

    await expect(executeAction("a1")).rejects.toThrow("Solo se puede ejecutar en estado approved");
  });

  it("executes connector and updates to verified on success", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: "a1",
        status: "approved",
        connector: "github.create_issue",
        configEncrypted: "encrypted_data",
        title: "Fix issue",
        steps: ["step1"],
      }]),
    });

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    dbUpdateMock.mockReturnValue({ set: setMock });

    vi.mocked(executeConnector).mockResolvedValue({ evidence: { ok: true, issueUrl: "http://gh" } });

    const result = await executeAction("a1");
    expect(result.ok).toBe(true);
    expect(result.issueUrl).toBe("http://gh");
    expect(setMock).toHaveBeenCalledTimes(2);
  });

  it("updates to failed and rethrows on connector error", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: "a1",
        status: "approved",
        connector: "cloudflare.purge_cache",
        configEncrypted: null,
        title: "Purge cache",
        steps: [],
      }]),
    });

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    dbUpdateMock.mockReturnValue({ set: setMock });

    vi.mocked(executeConnector).mockRejectedValue(new Error("API token invalid"));

    await expect(executeAction("a1")).rejects.toThrow("API token invalid");
  });

  it("handles non-Error thrown values in catch block", async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: "a1",
        status: "approved",
        connector: "http.request",
        configEncrypted: null,
        title: "HTTP call",
        steps: [],
      }]),
    });

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    dbUpdateMock.mockReturnValue({ set: setMock });

    vi.mocked(executeConnector).mockRejectedValue("string error");

    await expect(executeAction("a1")).rejects.toThrow("string error");
  });
});
