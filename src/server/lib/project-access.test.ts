import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  projectRow: null as null | { id: string; ownerId: string },
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: async () => state.projectRow,
      },
    },
  },
}));

import { assertProjectAccess } from "./project-access";

describe("project-access — owner-only (ADR-0XX)", () => {
  beforeEach(() => {
    state.projectRow = null;
  });

  it("owner pasa con rol owner", async () => {
    state.projectRow = { id: "p1", ownerId: "u1" };
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: true, role: "owner" });
  });

  it("propietario de otro proyecto queda fuera", async () => {
    state.projectRow = { id: "p1", ownerId: "u9" };
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });

  it("sin proyecto → 404", async () => {
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });
});
