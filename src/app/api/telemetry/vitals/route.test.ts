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
});
