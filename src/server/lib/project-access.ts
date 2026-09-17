import "server-only";
import { and, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects, projectMembers } from "@/shared/db/schemas";
import type { ProjectRole } from "@/server/auth/rbac";

export type ProjectAccessRole = "owner" | ProjectRole;

export interface ProjectAccess {
  ok: boolean;
  role: ProjectAccessRole | null;
}

/**
 * Rol efectivo del usuario en el proyecto: owner, rol de miembro o null.
 * Usa directDb (service role) SOLO para leer membresía.
 */
export async function getProjectRole(
  userId: string,
  projectId: string
): Promise<ProjectAccessRole | null> {
  const project = await directDb.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, ownerId: true },
  });

  if (!project) return null;
  if (project.ownerId === userId) return "owner";

  const member = await directDb.query.projectMembers.findFirst({
    where: and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, userId)
    ),
  });

  return member?.role ?? null;
}

/**
 * project-access.ts — Acceso multi-tenant consistente (P1-6, A-3).
 *
 * owner (projects.owner_id) O miembro (project_members con su rol real).
 * Usa directDb (service role) SOLO para leer membresía — nunca para leer
 * datos del proyecto (eso sigue vía withRLS o checks aquí).
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccess> {
  const role = await getProjectRole(userId, projectId);
  if (!role) return { ok: false, role: null };
  return { ok: true, role };
}
