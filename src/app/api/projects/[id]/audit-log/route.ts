import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { checkPermission } from "@/server/auth/rbac";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { projects, teamAuditLogs } from "@/shared/db/schemas";
import { getProjectRole, type ProjectAccessRole } from "@/server/lib/project-access";
import { PaginationSchema } from "@/shared/schemas/api";
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
  if (!role || !checkPermission(role, "read", "audit-log")) {
    return { error: NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 }) };
  }
  return { userId: user.id, role };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const auth = await authorizeProject(projectId);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");
  if (pageParam) raw.page = pageParam;
  if (limitParam) raw.limit = limitParam;

  const parsed = PaginationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Parámetros de paginación inválidos" },
      { status: 400 }
    );
  }
  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  try {
    const data = await withRLS(auth.userId, async (tx) => {
      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { id: true },
      });
      if (!project) return null;

      const entries = await tx.query.teamAuditLogs.findMany({
        where: eq(teamAuditLogs.projectId, projectId),
        orderBy: desc(teamAuditLogs.createdAt),
        limit,
        offset,
      });
      const countRows = await tx
        .select({ total: sql<number>`count(*)` })
        .from(teamAuditLogs)
        .where(eq(teamAuditLogs.projectId, projectId));

      return { entries, total: Number(countRows[0]?.total ?? 0) };
    });

    if (!data) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      projectId,
      page,
      limit,
      total: data.total,
      entries: data.entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        targetEmail: entry.targetEmail,
        role: entry.role,
        actorId: entry.actorId,
        createdAt: entry.createdAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error("GET audit-log failure:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: "Error al procesar la solicitud" }, { status: 500 });
  }
}
