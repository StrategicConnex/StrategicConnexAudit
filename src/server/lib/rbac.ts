import "server-only";
import type { ProjectRole } from "@/server/auth/rbac";

/**
 * RBAC service (plan 4.5) — reducido a stubs legacy por P2-16.
 *
 * El producto es owner-only (ADR-0XX) y `project_members` se eliminó en la
 * migración 0052, así que las mutaciones de membresía que vivían aquí no tienen
 * tabla donde escribir. Se conservan con la misma firma para no romper a sus
 * importadores y para que el día que exista colaboración real se implementen
 * contra el modelo nuevo, nunca contra el abandonado.
 *
 * `getProjectRole` vive en `@/server/lib/project-access`; el criterio de acceso
 * es `projects.owner_id`.
 */

export type AssignableProjectRole = Exclude<ProjectRole, "owner">;

export type MemberMutationCode =
  | "project-not-found"
  | "member-not-found"
  | "owner-protected"
  | "self-modify"
  | "last-owner";

export type MemberMutationResult = { ok: true } | { ok: false; code: MemberMutationCode };

/** No hay miembros que mutar: el único rol real es el del owner del proyecto. */
const NO_MEMBERS: MemberMutationResult = { ok: false, code: "member-not-found" };

/** Legacy stub: el alta de miembros no existe en un producto owner-only. */
export async function addMember(
  _projectId: string,
  _userId: string,
  _role: AssignableProjectRole,
  _actorId: string
): Promise<MemberMutationResult> {
  return NO_MEMBERS;
}

/** Legacy stub: no hay roles que cambiar mientras no existan membresías. */
export async function updateMemberRole(
  _projectId: string,
  _targetUserId: string,
  _role: AssignableProjectRole,
  _actorId: string
): Promise<MemberMutationResult> {
  return NO_MEMBERS;
}

/** Legacy stub: no hay membresías que expulsar. */
export async function removeProjectMember(
  _projectId: string,
  _targetUserId: string,
  _actorId: string
): Promise<MemberMutationResult> {
  return NO_MEMBERS;
}
