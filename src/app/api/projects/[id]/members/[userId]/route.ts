import { NextResponse } from "next/server";
import { z } from "zod";
import { canPerformAction } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { getProjectRole, type ProjectAccessRole } from "@/server/lib/project-access";
import {
  removeProjectMember,
  updateMemberRole,
  type MemberMutationCode,
} from "@/server/lib/rbac";
import { logger } from "@/lib/logger";

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

const roleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer", "guest"]),
});

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

async function handleRoleUpdate(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
): Promise<NextResponse> {
  const { id: projectId, userId: targetUserId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  try {
    const parsed = roleSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Rol válido requerido (admin, editor, viewer o guest)" },
        { status: 400 }
      );
    }

    const result = await updateMemberRole(
      projectId,
      targetUserId,
      parsed.data.role,
      auth.userId
    );
    if (!result.ok) return mutationError(result.code);

    return NextResponse.json({
      success: true,
      projectId,
      userId: targetUserId,
      role: parsed.data.role,
    });
  } catch (error) {
    logger.error("PATCH member failure:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  return handleRoleUpdate(request, ctx);
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  return handleRoleUpdate(request, ctx);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  try {
    const result = await removeProjectMember(projectId, targetUserId, auth.userId);
    if (!result.ok) return mutationError(result.code);

    return NextResponse.json({ success: true, projectId, userId: targetUserId });
  } catch (error) {
    logger.error("DELETE member failure:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
