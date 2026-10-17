import { describe, it, expect } from "vitest";
import { addMember, updateMemberRole, removeProjectMember } from "./rbac";

/**
 * owner-only product mode (ADR-0XX, migración 0052): las mutaciones de membresía
 * son stubs legacy. No hay `project_members`, así que no hay nada que mockear —
 * el valor del test es fijar el contrato de fallo (`member-not-found`) que ven
 * las rutas de `/api/projects/[id]/members`.
 */
describe("rbac service — owner-only legacy stubs (ADR-0XX)", () => {
  it("addMember siempre rechaza porque no hay membresías", async () => {
    expect(await addMember("p1", "u-2", "editor", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
  });

  it("updateMemberRole siempre rechaza porque no hay membresías", async () => {
    expect(await updateMemberRole("p1", "u-2", "admin", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
  });

  it("removeProjectMember siempre rechaza porque no hay membresías", async () => {
    expect(await removeProjectMember("p1", "u-2", "u-owner")).toEqual({
      ok: false,
      code: "member-not-found",
    });
  });
});
