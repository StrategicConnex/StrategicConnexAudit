import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { getProjectRole } from "@/server/lib/project-access";
import { logger } from "@/lib/logger";

/**
 * GET /api/projects/[id]/branding — marca blanca del proyecto (B-4).
 * Lectura para cualquier miembro; escritura vía updateProjectBranding.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const role = await getProjectRole(user.id, projectId);
    if (!role) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }
    const branding = await withRLS(user.id, async (tx) => {
      const [row] = await tx
        .select({ settings: projects.settings })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const settings = (row?.settings ?? {}) as {
        branding?: Record<string, unknown>;
        telegramChatId?: string | null;
      };
      return { branding: settings.branding ?? {}, telegramChatId: settings.telegramChatId ?? null };
    });
    return NextResponse.json({ success: true, ...branding, myRole: role });
  } catch (error) {
    logger.error("GET branding failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
