import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRemoveMember = vi.fn(async (_projectId: string, _userId: string): Promise<boolean> => true);

const db = {
  project: null as null | { id: string; ownerId: string },
  member: null as null | { id: string; role: string },
  ownerCount: 0,
  user: null as null | { email: string },
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
};

vi.mock("@/server/lib/invitations", () => ({
  removeMember: (projectId: string, userId: string) => mockRemoveMember(projectId, userId),
}));

vi.mock("@/shared/db", () => ({
  directDb: {
    query: {
      projects: { findFirst: vi.fn(async () => db.project) },
      projectMembers: { findFirst: vi.fn(async () => db.member) },
      users: { findFirst: vi.fn(async () => db.user) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ total: db.ownerCount }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          db.updates.push(values);
          return [{ id: db.member?.id ?? "m-1" }];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        db.inserts.push(values);
        return {
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: "m-new" }]),
          })),
        };
      }),
    })),
  },
}));

import { addMember, updateMemberRole, removeProjectMember } from "./rbac";

describe("rbac service — addMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveMember.mockResolvedValue(true);
    db.project = { id: "p1", ownerId: "u-owner" };
    db.member = null;
    db.ownerCount = 0;
    db.user = { email: "nuevo@x.com" };
    db.updates = [];
    db.inserts = [];
  });

  it("proyecto inexistente → project-not-found", async () => {
    db.project = null;
    expect(await addMember("pX", "u-2", "editor", "u-owner")).toEqual({
      ok: false,
      code: "project-not-found",
    });
    expect(db.inserts).toHaveLength(0);
  });

  it("objetivo es el owner real → owner-protected", async () => {
    expect(await addMember("p1", "u-owner", "editor", "u-admin")).toEqual({
      ok: false,
      code: "owner-protected",
    });
  });

  it("ya es miembro → idempotente sin inserts", async () => {
    db.member = { id: "m-2", role: "viewer" };
    expect(await addMember("p1", "u-2", "editor", "u-owner")).toEqual({ ok: true });
    expect(db.inserts).toHaveLength(0);
  });

  it("miembro nuevo → inserta membresía y audita member_added", async () => {
    const res = await addMember("p1", "u-2", "editor", "u-owner");
    expect(res).toEqual({ ok: true });
    expect(db.inserts[0]).toMatchObject({
      projectId: "p1",
      userId: "u-2",
      role: "editor",
    });
    expect(db.inserts[1]).toMatchObject({
      action: "member_added",
      targetEmail: "nuevo@x.com",
      actorId: "u-owner",
    });
  });
});

describe("rbac service — updateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project = { id: "p1", ownerId: "u-owner" };
    db.member = { id: "m-2", role: "editor" };
    db.ownerCount = 0;
    db.user = { email: "u2@x.com" };
    db.updates = [];
    db.inserts = [];
  });

  it("cambia el rol y audita role_changed", async () => {
    const res = await updateMemberRole("p1", "u-2", "admin", "u-owner");
    expect(res).toEqual({ ok: true });
    expect(db.updates[0]).toMatchObject({ role: "admin" });
    expect(db.inserts[0]).toMatchObject({ action: "role_changed", targetEmail: "u2@x.com" });
  });

  it("no permite modificar el propio rol → self-modify", async () => {
    const res = await updateMemberRole("p1", "u-owner-2", "viewer", "u-owner-2");
    expect(res).toEqual({ ok: false, code: "self-modify" });
    expect(db.updates).toHaveLength(0);
  });

  it("no permite tocar al owner real → owner-protected", async () => {
    const res = await updateMemberRole("p1", "u-owner", "viewer", "u-admin");
    expect(res).toEqual({ ok: false, code: "owner-protected" });
  });

  it("miembro inexistente → member-not-found", async () => {
    db.member = null;
    expect(await updateMemberRole("p1", "u-2", "admin", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
  });

  it("no degrada al último owner de project_members → last-owner", async () => {
    db.member = { id: "m-3", role: "owner" };
    db.ownerCount = 1;
    const res = await updateMemberRole("p1", "u-3", "viewer", "u-owner");
    expect(res).toEqual({ ok: false, code: "last-owner" });
    expect(db.updates).toHaveLength(0);
  });
});

describe("rbac service — removeProjectMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveMember.mockResolvedValue(true);
    db.project = { id: "p1", ownerId: "u-owner" };
    db.member = { id: "m-2", role: "editor" };
    db.ownerCount = 0;
    db.user = { email: "u2@x.com" };
    db.updates = [];
    db.inserts = [];
  });

  it("expulsa y audita member_removed", async () => {
    const res = await removeProjectMember("p1", "u-2", "u-owner");
    expect(res).toEqual({ ok: true });
    expect(mockRemoveMember).toHaveBeenCalledWith("p1", "u-2");
    expect(db.inserts[0]).toMatchObject({ action: "member_removed" });
  });

  it("no permite expulsar al owner real → owner-protected", async () => {
    const res = await removeProjectMember("p1", "u-owner", "u-admin");
    expect(res).toEqual({ ok: false, code: "owner-protected" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("miembro inexistente → member-not-found", async () => {
    db.member = null;
    expect(await removeProjectMember("p1", "u-2", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("no permite expulsar al último owner → last-owner", async () => {
    db.member = { id: "m-3", role: "owner" };
    db.ownerCount = 1;
    const res = await removeProjectMember("p1", "u-3", "u-owner");
    expect(res).toEqual({ ok: false, code: "last-owner" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("baja no confirmada por la BD → member-not-found", async () => {
    mockRemoveMember.mockResolvedValue(false);
    expect(await removeProjectMember("p1", "u-2", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
    expect(db.inserts).toHaveLength(0);
  });
});
