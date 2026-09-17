import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  projectRows: [] as Array<{ id: string; ownerId: string }>,
  memberRows: [] as Array<{ role: string }>,
  calls: 0,
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            state.calls += 1;
            // 1º select del helper = projects, 2º = project_members.
            return state.calls % 2 === 1 ? state.projectRows : state.memberRows;
          },
        }),
      }),
    }),
  },
}));

import { assertProjectAccess } from "./project-access";

describe("project-access — multi-tenant (P1-6)", () => {
  beforeEach(() => {
    state.calls = 0;
    state.projectRows.length = 0;
    state.memberRows.length = 0;
  });

  it("owner pasa con rol owner", async () => {
    state.projectRows.push({ id: "p1", ownerId: "u1" });
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: true, role: "owner" });
  });

  it("miembro pasa con rol member", async () => {
    state.projectRows.push({ id: "p1", ownerId: "u9" });
    state.memberRows.push({ role: "viewer" });
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: true, role: "member" });
  });

  it("sin proyecto → 404", async () => {
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });

  it("proyecto ajeno sin membresía → 404", async () => {
    state.projectRows.push({ id: "p1", ownerId: "u9" });
    expect(await assertProjectAccess("u1", "p1")).toEqual({ ok: false, role: null });
  });
});
