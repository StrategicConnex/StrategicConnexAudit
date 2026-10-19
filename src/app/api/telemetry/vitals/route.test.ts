import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findFirstMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/shared/db", () => ({
  db: {
    query: { projects: { findFirst: findFirstMock } },
    insert: () => ({ values: insertValuesMock }),
  },
}));

vi.mock("@/shared/db/schemas", () => ({
  webVitalsLogs: { __table: "webVitalsLogs" },
  projects: { id: "id", __table: "projects" },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/telemetry/vitals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const base = {
  projectId: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/",
};

describe("POST /api/telemetry/vitals — beacon token (P0-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 si el proyecto tiene secreto y el cuerpo no lo trae", async () => {
    findFirstMock.mockResolvedValue({
      id: base.projectId,
      deletedAt: null,
      isDeleted: false,
      isHidden: false,
      beaconSecret: "s3cr3t",
    });
    const res = await POST(req(base));
    expect(res.status).toBe(401);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("204 con token correcto", async () => {
    findFirstMock.mockResolvedValue({
      id: base.projectId,
      deletedAt: null,
      isDeleted: false,
      isHidden: false,
      beaconSecret: "s3cr3t",
    });
    const res = await POST(req({ ...base, beaconToken: "s3cr3t" }));
    expect(res.status).toBe(204);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
  });

  it("204 en proyecto legacy sin secreto (NULL = abierto)", async () => {
    findFirstMock.mockResolvedValue({
      id: base.projectId,
      deletedAt: null,
      isDeleted: false,
      isHidden: false,
      beaconSecret: null,
    });
    const res = await POST(req(base));
    expect(res.status).toBe(204);
  });

  it("404 si el proyecto no existe", async () => {
    findFirstMock.mockResolvedValue(undefined);
    const res = await POST(req(base));
    expect(res.status).toBe(404);
  });

  it("503 fail-closed (no 500 opaco) si findFirst lanza en la capa DB", async () => {
    // La forma exacta del 500 de prod (2026-10-19): la capa DB lanza.
    findFirstMock.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(base));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ error: "telemetry_unavailable", stage: "lookup" });
    expect(insertValuesMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("404 (no 500) si el insert lanza FK violation 23503 (proyecto borrado entre lookup e insert)", async () => {
    findFirstMock.mockResolvedValue({
      id: base.projectId,
      deletedAt: null,
      isDeleted: false,
      isHidden: false,
      beaconSecret: null,
    });
    insertValuesMock.mockRejectedValueOnce(
      Object.assign(new Error('insert or update on table "web_vitals_logs" violates foreign key constraint'), { code: "23503" })
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(base));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("project_not_found");
    spy.mockRestore();
  });

  it("503 fail-closed si el insert lanza un error de DB distinto de FK", async () => {
    findFirstMock.mockResolvedValue({
      id: base.projectId,
      deletedAt: null,
      isDeleted: false,
      isHidden: false,
      beaconSecret: null,
    });
    insertValuesMock.mockRejectedValueOnce(new Error("SSL connection was closed unexpectedly"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(base));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ error: "telemetry_unavailable", stage: "insert" });
    spy.mockRestore();
  });
});
