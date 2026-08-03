import { NextResponse } from "next/server";
import { ProjectRole } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";

/**
 * VULN-008 fix: el endpoint exige sesión y verifica que el proyecto pertenezca
 * al usuario (owner-check bajo RLS) ANTES de responder. El payload sigue siendo
 * mock hasta conectar datos reales, pero la superficie ya no es pública.
 */
async function authorizeProject(projectId: string): Promise<
  | { user: { id: string } }
  | { error: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }

  const owned = await withRLS(user.id, async (tx) =>
    tx.query.projects.findFirst({ where: eq(projects.id, projectId) })
  );
  if (!owned) {
    return { error: NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 }) };
  }

  return { user: { id: user.id } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  // Mock response until DB connection / Auth Context is wired in
  const members = [
    {
      id: "mem_1",
      projectId,
      userId: "usr_owner",
      email: "owner@company.com",
      fullName: "Lead Architect",
      role: "owner" as ProjectRole,
      createdAt: new Date().toISOString(),
    },
    {
      id: "mem_2",
      projectId,
      userId: "usr_editor",
      email: "security-engineer@company.com",
      fullName: "Security Ops",
      role: "editor" as ProjectRole,
      createdAt: new Date().toISOString(),
    }
  ];

  return NextResponse.json({
    success: true,
    projectId,
    members,
    invitations: [],
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { email, role } = body as { email: string; role: ProjectRole };

    if (!email || !role) {
      return NextResponse.json(
        { success: false, error: "Email y rol son requeridos" },
        { status: 400 }
      );
    }

    // Mock response for invitation creation
    const invitation = {
      id: `inv_${Date.now()}`,
      projectId,
      email,
      role,
      token: `tok_${Math.random().toString(36).substring(2)}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      message: `Invitación enviada exitosamente a ${email}`,
      invitation,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
