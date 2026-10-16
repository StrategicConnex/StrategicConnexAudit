import { NextResponse } from "next/server";
import { z } from "zod";
import { canPerformAction } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { directDb } from "@/shared/db";
import { projects, users } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { getProjectRole, type ProjectAccessRole } from "@/server/lib/project-access";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

async function authorizeProject(
  projectId: string,
  action: "members:view" | "members:manage"
): Promise<{ userId: string; role: ProjectAccessRole } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  const role = await getProjectRole(user.id, projectId);
  if (!role || !canPerformAction(role, action)) {
    return { error: NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 }) };
  }
  return { userId: user.id, role };
}

async function rawGet(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId, "members:view");
  if ("error" in auth) return auth.error;

  const data = await withRLS(auth.userId, async (tx) => {
    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true, ownerId: true, name: true },
    });
    if (!project) return null;

    const owner = await directDb.query.users.findFirst({
      where: eq(users.id, project.ownerId),
      columns: { id: true, email: true, fullName: true },
    });

    return {
      members: owner
        ? [{
            id: `owner-${owner.id}`,
            userId: owner.id,
            email: owner.email,
            fullName: owner.fullName ?? undefined,
            role: "owner" as const,
            createdAt: null as string | null,
          }]
        : [],
      invitations: [],
    };
  });

  if (!data) {
    return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ success: true, projectId, myRole: auth.role, ...data });
}

export const GET = withRequestContext(rawGet);

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer", "guest"]),
});

async function rawPost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId, "members:manage");
  if ("error" in auth) return auth.error;

  try {
    const parsed = inviteSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Email y rol válidos son requeridos" }, { status: 400 });
    }

    const project = await withRLS(auth.userId, async (tx) =>
      tx.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { id: true, name: true },
      })
    );
    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    // El producto es owner-only hoy (ADR-0XX). No hay flujo activo de invitaciones
    // de equipo; devolvemos un error claro en lugar de intentar crear una invitación
    // residual.
    return NextResponse.json(
      { success: false, error: "Las invitaciones de equipo no están habilitadas en este proyecto" },
      { status: 400 }
    );
  } catch (error) {
    logger.error("POST members failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}

export const POST = withRequestContext(rawPost);

async function rawDelete(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId, "members:manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const memberUserId = searchParams.get("memberUserId");
  const invitationId = searchParams.get("invitationId");

  if (memberUserId || invitationId) {
    // El producto es owner-only hoy (ADR-0XX). No hay miembros ni invitaciones
    // activas; cualquier intento de gestión se rechaza explícitamente.
    return NextResponse.json(
      { success: false, error: "La gestión de miembros no está habilitada en este proyecto" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: false, error: "Falta memberUserId o invitationId" }, { status: 400 });
}

export const DELETE = withRequestContext(rawDelete);
