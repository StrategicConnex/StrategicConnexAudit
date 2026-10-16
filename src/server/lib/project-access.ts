import "server-only";
import { eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import type { ProjectRole } from "@/server/auth/rbac";
import { canPerformAction, type PermissionAction } from "@/server/auth/rbac";

export type ProjectAccessRole = "owner" | ProjectRole;

export interface ProjectAccess {
  ok: boolean;
  role: ProjectAccessRole | null;
}

/**
 * Rol efectivo del usuario en el proyecto: owner o null.
 * El proyecto es owner-only hoy (ADR-0XX); ya no hay membresías.
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

  return null;
}

/**
 * project-access.ts — Acceso multi-tenant consistente (P1-6, A-3).
 *
 * owner (projects.owner_id). El acceso de equipo no está activo en este producto.
 */
export async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccess> {
  const role = await getProjectRole(userId, projectId);
  if (!role) return { ok: false, role: null };
  return { ok: true, role };
}

/**
 * Gate de permiso para Server Actions y rutas (A-3).
 * Retorna mensaje de error listo para responder, o null si puede continuar.
 */
export async function requireProjectPermission(
  userId: string,
  projectId: string,
  action: PermissionAction
): Promise<string | null> {
  const role = await getProjectRole(userId, projectId);
  if (!role) return "Proyecto no encontrado";
  if (!canPerformAction(role, action)) {
    return "No tienes permiso para esta acción";
  }
  return null;
}
