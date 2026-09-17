import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  projectRow: null as null | { id: string; ownerId: string },
  memberRow: null as null | { role: string },
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: {
        findFirst: async () => state.projectRow,
      },
      projectMembers: {
        findFirst: async () => state.memberRow,
      },
    },
  },
}));

import { assertProjectAccess } from "./project-access";

describe("project-access — multi-tenant (P1-6)", () => {
  beforeEach(() => {
    state.projectRow = null;
    state.memberRow = null;
  });

  it("owner pasa con rol owner", async () => {
    state.projectRow = { id: "p1", ownerId: "u1" };
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: true, role: "owner" });
  });

  it("miembro pasa con rol member", async () => {
    state.projectRow = { id: "p1", ownerId: "u9" };
    state.memberRow = { role: "viewer" };
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: true, role: "member" });
  });

  it("sin proyecto → 404", async () => {
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });

  it("proyecto ajeno sin membresía → 404", async () => {
    state.projectRow = { id: "p1", ownerId: "u9" };
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });
});
