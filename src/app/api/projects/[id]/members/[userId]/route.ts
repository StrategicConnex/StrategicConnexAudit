import { NextResponse } from "next/server";
import { canPerformAction } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { getProjectRole, type ProjectAccessRole } from "@/server/lib/project-access";
import { type MemberMutationCode } from "@/server/lib/rbac";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

async function authorizeProject(
  projectId: string
): Promise<{ userId: string; role: ProjectAccessRole } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  const role = await getProjectRole(user.id, projectId);
  if (!role || !canPerformAction(role, "members:manage")) {
    return { error: NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 }) };
  }
  return { userId: user.id, role };
}

const MUTATION_ERRORS: Record<MemberMutationCode, { status: number; error: string }> = {
  "project-not-found": { status: 404, error: "Proyecto no encontrado" },
  "member-not-found": { status: 404, error: "Miembro no encontrado" },
  "owner-protected": { status: 403, error: "No puedes modificar al propietario del proyecto" },
  "self-modify": { status: 403, error: "No puedes cambiar tu propio rol" },
  "last-owner": { status: 403, error: "No puedes quitar el último propietario del proyecto" },
};

function mutationError(code: MemberMutationCode): NextResponse {
  const info = MUTATION_ERRORS[code];
  return NextResponse.json({ success: false, error: info.error }, { status: info.status });
}

async function rawPatch(
  _request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await ctx.params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  // El producto es owner-only hoy (ADR-0XX). No hay flujo activo de actualización
  // de roles de miembros.
  return NextResponse.json(
    { success: false, error: "La modificación de roles de miembros no está habilitada en este proyecto" },
    { status: 400 }
  );
}

export const PATCH = withRequestContext(rawPatch);

async function rawPut(
  _request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  return rawPatch(_request, ctx);
}

export const PUT = withRequestContext(rawPut);

async function rawDelete(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  // El producto es owner-only hoy (ADR-0XX). No hay miembros activos en el proyecto.
  return NextResponse.json(
    { success: false, error: "La gestión de miembros no está habilitada en este proyecto" },
    { status: 400 }
  );
}

export const DELETE = withRequestContext(rawDelete);
