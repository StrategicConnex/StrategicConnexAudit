import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  invitation: null as null | {
    id: string;
    projectId: string;
    email: string;
    role: "viewer";
    token: string;
    expiresAt: Date;
  },
  deleted: [] as string[],
  members: [] as Array<{ projectId: string; userId: string }>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/shared/db", () => {
  const rowsFor = (v: Record<string, unknown>) => {
    if ("token" in v) {
      state.invitation = { ...(v as unknown as NonNullable<typeof state.invitation>), id: "inv-1" };
      return [{ id: "inv-1", expiresAt: (v as { expiresAt: Date }).expiresAt }];
    }
    if ("userId" in v && "projectId" in v && !("actorId" in v)) {
      state.members.push(v as unknown as (typeof state.members)[number]);
      return [{ id: "m-1" }];
    }
    state.audits.push(v);
    return [{ id: "a-1" }];
  };
  return {
    directDb: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => (state.invitation ? [state.invitation] : []) }),
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          // Eager: la clasificación ocurre aquí porque algunos inserts no
          // encadenan .returning() (member/auditoría) y otros sí (invitación).
          const rows = rowsFor(v);
          return {
            onConflictDoUpdate: () => ({
              returning: async () => rows,
            }),
          };
        },
      }),
      delete: () => ({
        where: async () => {
          state.deleted.push("x");
          state.invitation = null;
          return [{ id: "x" }];
        },
      }),
    },
  };
});

import { acceptInvitation, createInvitation } from "./invitations";

describe("invitations — aceptar y crear (A-2)", () => {
  beforeEach(() => {
    state.invitation = null;
    state.deleted = [];
    state.members = [];
    state.audits = [];
  });

  it("acepta token válido: crea miembro, consume invitación, audita", async () => {
    state.invitation = {
      id: "inv-1",
      projectId: "p1",
      email: "nuevo@x.com",
      role: "viewer",
      token: "tok",
      expiresAt: new Date(Date.now() + 86400000),
    };
    const res = await acceptInvitation("tok", "u-nuevo");
    expect(res).toEqual({ ok: true, projectId: "p1" });
    expect(state.members).toHaveLength(1);
    expect(state.invitation).toBeNull();
    expect(state.audits.length).toBeGreaterThan(0);
  });

  it("token inexistente → error", async () => {
    expect(await acceptInvitation("nope", "u1")).toEqual({
      ok: false,
      error: "Invitación inválida o ya usada",
    });
  });

  it("token vencido → error y purga", async () => {
    state.invitation = {
      id: "inv-1",
      projectId: "p1",
      email: "nuevo@x.com",
      role: "viewer",
      token: "tok",
      expiresAt: new Date(Date.now() - 1000),
    };
    const res = await acceptInvitation("tok", "u1");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("venció");
    expect(state.invitation).toBeNull();
  });

  it("createInvitation genera token, URL y audita (sin email sin key)", async () => {
    delete process.env.RESEND_API_KEY;
    const inv = await createInvitation("p1", "Mi Sitio", "NUEVO@x.com", "editor", "u-owner");
    expect(inv.email).toBe("nuevo@x.com");
    expect(inv.inviteUrl).toContain("/invite/");
    expect(inv.emailSent).toBe(false);
  });
});
