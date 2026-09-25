import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projectMembers, projects, teamAuditLogs, users } from "@/shared/db/schemas";
import { removeMember } from "@/server/lib/invitations";
import type { ProjectRole } from "@/server/auth/rbac";

/**
 * RBAC service (plan 4.5). `getProjectRole` vive en `@/server/lib/project-access`
 * y `removeMember` en `@/server/lib/invitations` (reutilizado aquí, sin duplicar);
 * este módulo aporta las mutaciones de membresía con las protecciones de owner.
 */

export type AssignableProjectRole = Exclude<ProjectRole, "owner">;

export type MemberMutationCode =
  | "project-not-found"
  | "member-not-found"
  | "owner-protected"
  | "self-modify"
  | "last-owner";

export type MemberMutationResult = { ok: true } | { ok: false; code: MemberMutationCode };

async function findProject(projectId: string) {
  return directDb.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, ownerId: true },
  });
}

async function findMember(projectId: string, userId: string) {
  return directDb.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    columns: { id: true, role: true },
  });
}

async function countProjectOwnerMembers(projectId: string): Promise<number> {
  const rows = await directDb
    .select({ total: sql<number>`count(*)` })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, "owner")));
  return Number(rows[0]?.total ?? 0);
}

async function writeTeamAudit(
  projectId: string,
  actorId: string,
  action: string,
  targetUserId: string,
  role: ProjectRole
): Promise<void> {
  const target = await directDb.query.users.findFirst({
    where: eq(users.id, targetUserId),
    columns: { email: true },
  });
  await directDb.insert(teamAuditLogs).values({
    projectId,
    actorId,
    action,
    targetEmail: target?.email ?? null,
    role,
  });
}

/**
 * Asegura la membresía de un usuario (idempotente). El rol owner real vive en
 * `projects.owner_id`, por eso solo se admiten roles asignables.
 */
export async function addMember(
  projectId: string,
  userId: string,
  role: AssignableProjectRole,
  actorId: string
): Promise<MemberMutationResult> {
  const project = await findProject(projectId);
  if (!project) return { ok: false, code: "project-not-found" };
  if (project.ownerId === userId) return { ok: false, code: "owner-protected" };

  const existing = await findMember(projectId, userId);
  if (existing) return { ok: true };

  await directDb
    .insert(projectMembers)
    .values({ projectId, userId, role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role, updatedAt: new Date() },
    });
  await writeTeamAudit(projectId, actorId, "member_added", userId, role);
  return { ok: true };
}

/** Cambia el rol de un miembro con protecciones de owner y auto-modificación. */
export async function updateMemberRole(
  projectId: string,
  targetUserId: string,
  role: AssignableProjectRole,
  actorId: string
): Promise<MemberMutationResult> {
  const project = await findProject(projectId);
  if (!project) return { ok: false, code: "project-not-found" };
  if (project.ownerId === targetUserId) return { ok: false, code: "owner-protected" };
  if (actorId === targetUserId) return { ok: false, code: "self-modify" };

  const member = await findMember(projectId, targetUserId);
  if (!member) return { ok: false, code: "member-not-found" };
  if (member.role === "owner" && (await countProjectOwnerMembers(projectId)) <= 1) {
    return { ok: false, code: "last-owner" };
  }

  await directDb
    .update(projectMembers)
    .set({ role, updatedAt: new Date() })
    .where(eq(projectMembers.id, member.id));

  await writeTeamAudit(projectId, actorId, "role_changed", targetUserId, role);
  return { ok: true };
}

/**
 * Expulsa a un miembro. No al owner real (`projects.owner_id`, protegido arriba)
 * ni al último miembro con rol owner. Reutiliza `removeMember` de invitations.
 */
export async function removeProjectMember(
  projectId: string,
  targetUserId: string,
  actorId: string
): Promise<MemberMutationResult> {
  const project = await findProject(projectId);
  if (!project) return { ok: false, code: "project-not-found" };
  if (project.ownerId === targetUserId) return { ok: false, code: "owner-protected" };

  const member = await findMember(projectId, targetUserId);
  if (!member) return { ok: false, code: "member-not-found" };
  if (member.role === "owner" && (await countProjectOwnerMembers(projectId)) <= 1) {
    return { ok: false, code: "last-owner" };
  }

  const removed = await removeMember(projectId, targetUserId);
  if (!removed) return { ok: false, code: "member-not-found" };

  await writeTeamAudit(projectId, actorId, "member_removed", targetUserId, member.role);
  return { ok: true };
}
