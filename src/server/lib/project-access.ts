import "server-only";
import { and, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects, projectMembers } from "@/shared/db/schemas";

export type ProjectAccessRole = "owner" | "member";

export interface ProjectAccess {
  ok: boolean;
  role: ProjectAccessRole | null;
}

/**
 * project-access.ts — Acceso multi-tenant consistente (P1-6).
 *
 * owner (projects.owner_id) O miembro (project_members), sin importar el rol
 * de plataforma. Usa directDb (service role) SOLO para leer membresía —
 * nunca para leer datos del proyecto (eso sigue vía withRLS o checks aquí).
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccess> {
  const [project] = await directDb
    .select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return { ok: false, role: null };
  if (project.ownerId === userId) return { ok: true, role: "owner" };

  const [member] = await directDb
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
    .limit(1);

  if (!member) return { ok: false, role: null };
  return { ok: true, role: "member" };
}
