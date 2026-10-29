import { after, NextRequest, NextResponse } from "next/server";
import { POST as runIntelligenceScan } from "@/app/api/intelligence/route";
import { z } from "zod";
import { withRLS } from "@/shared/db/rls";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRateLimit } from "@/shared/lib/ratelimit";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

export const dynamic = "force-dynamic";

const bulkScanSchema = z.object({
  projectId: z.string().uuid(),
  targets: z.array(z.string().min(1).max(256)).min(1).max(10)
});

export const POST = withRateLimit(
  {
    limit: 5,
    window: 60,
    prefix: "bulk_scan_ip",
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    }
  },
  async (req: NextRequest, userId: string) => {
    try {
      const body = await req.json();
      const parseResult = bulkScanSchema.safeParse(body);
      if (!parseResult.success) {
        return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
      }

      const { projectId, targets } = parseResult.data;

      // Check authorization on project
      const project = await withRLS(userId, async (tx) => {
        return await tx.query.projects.findFirst({
          where: eq(projects.id, projectId)
        });
      });

      if (!project) {
        return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
      }

      const queuedTargets = targets
        .map((target) => target.trim().toLowerCase())
        .filter(Boolean);

      if (queuedTargets.length > 0) {
        after(async () => {
          await Promise.all(queuedTargets.map(async (target) => {
            try {
              const scanRequest = new NextRequest("http://internal/api/intelligence", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ target, projectId }),
              });
              const response = await runIntelligenceScan(scanRequest);
              if (!response.ok) {
                logger.error(`Background bulk-scan failed for target ${target}: HTTP ${response.status}`);
              }
            } catch (error: unknown) {
              logger.error(`Background bulk-scan failed for target ${target}:`, error);
            }
          }));
        });
      }

      return NextResponse.json({
        success: true,
        message: `${queuedTargets.length} escaneos en cola con éxito.`,
        queued: queuedTargets.map((target) => ({ target, status: "queued" as const }))
      });
    } catch (error: unknown) {
      logger.error("POST bulk scan route failure:", { error: getErrorMessage(error) })
      return NextResponse.json({
        success: false,
        error: "Error interno del servidor"
      }, { status: 500 });
    }
  }
);
