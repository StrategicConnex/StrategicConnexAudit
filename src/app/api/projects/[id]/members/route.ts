import { NextResponse } from "next/server";
import { z } from "zod";
import { canPerformAction } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { directDb } from "@/shared/db";
import { projects, users, projectMembers, projectInvitations } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { getProjectRole, type ProjectAccessRole } from "@/server/lib/project-access";
import {
  createInvitation,
  rescindInvitation,
  removeMember,
} from "@/server/lib/invitations";
import { logger } from "@/lib/logger";

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

export async function GET(
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

    // Identidades del equipo fuera del contexto RLS: la policy users_select_self
    // (0025) solo expone el propio perfil al rol authenticated, pero los emails
    // de los miembros de un proyecto son datos de negocio del proyecto (el
    // acceso ya fue autorizado por getProjectRole) y se resuelven con la
    // conexión de servicio.
    const [owner, members, invitations] = await Promise.all([
      directDb.query.users.findFirst({
        where: eq(users.id, project.ownerId),
        columns: { id: true, email: true, fullName: true },
      }),
      directDb
        .select({
          id: projectMembers.id,
          userId: projectMembers.userId,
          role: projectMembers.role,
          email: users.email,
          fullName: users.fullName,
          createdAt: projectMembers.createdAt,
        })
        .from(projectMembers)
        .leftJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId)),
      directDb.query.projectInvitations.findMany({
        where: eq(projectInvitations.projectId, projectId),
        columns: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
    ]);

    return {
      members: [
        ...(owner
          ? [{
            id: `owner-${owner.id}`,
            userId: owner.id,
            email: owner.email,
            fullName: owner.fullName ?? undefined,
            role: "owner" as const,
            createdAt: null as string | null,
          }]
          : []),
        ...members.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.email ?? "—",
          fullName: m.fullName ?? undefined,
          role: m.role,
          createdAt: m.createdAt?.toISOString() ?? null,
        })),
      ],
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt?.toISOString() ?? null,
      })),
    };
  });

  if (!data) {
    return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ success: true, projectId, myRole: auth.role, ...data });
}

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "editor", "viewer", "guest"]),
});

export async function POST(
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

    const invitation = await createInvitation(
      projectId,
      project.name,
      parsed.data.email,
      parsed.data.role,
      auth.userId
    );

    return NextResponse.json({
      success: true,
      message: invitation.emailSent
        ? `Invitación enviada a ${invitation.email}`
        : `Invitación creada. Sin email configurado: comparte este link: ${invitation.inviteUrl}`,
      invitation,
    });
  } catch (error) {
    logger.error("POST members failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId, "members:manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const memberUserId = searchParams.get("memberUserId");
  const invitationId = searchParams.get("invitationId");

  if (memberUserId) {
    const ok = await removeMember(projectId, memberUserId);
    return NextResponse.json({ success: ok });
  }
  if (invitationId) {
    const ok = await rescindInvitation(invitationId);
    return NextResponse.json({ success: ok });
  }
  return NextResponse.json({ success: false, error: "Falta memberUserId o invitationId" }, { status: 400 });
}
