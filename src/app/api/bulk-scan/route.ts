import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations
} from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { withRateLimit } from "@/shared/lib/ratelimit";

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

      const cookieHeader = req.headers.get("cookie") || "";
      const authHeader = req.headers.get("authorization") || "";

      const queuedInvestigations: any[] = [];

      // Trigger each target asynchronously in RLS transactions
      for (const target of targets) {
        const cleanTarget = target.trim().toLowerCase();
        if (!cleanTarget) continue;

        // Insert a placeholder investigation as "running"
        const investigation = await withRLS(userId, async (tx) => {
          let targetType: "domain" | "hostname" | "url" | "ip" | "email" = "domain";
          if (cleanTarget.includes("@")) {
            targetType = "email";
          } else if (cleanTarget.includes("://")) {
            targetType = "url";
          }

          const [record] = await tx.insert(intelligenceInvestigations).values({
            projectId,
            ownerId: userId,
            title: `Escaneo Masivo: ${cleanTarget}`,
            target: cleanTarget,
            normalizedTarget: cleanTarget,
            targetType,
            status: "running"
          }).returning();

          return record;
        });

        queuedInvestigations.push(investigation);

        // Fire-and-forget background execution using our established intelligence route
        const targetUrl = new URL("/api/intelligence", req.nextUrl!.origin);

        fetch(targetUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookieHeader,
            "Authorization": authHeader
          },
          body: JSON.stringify({
            target: cleanTarget,
            projectId
          })
        }).catch(err => {
          console.error(`Background bulk-scan failed for target ${cleanTarget}:`, err);
        });
      }

      return NextResponse.json({
        success: true,
        message: `${queuedInvestigations.length} escaneos en cola con éxito.`,
        queued: queuedInvestigations.map(inv => ({
          id: inv.id,
          target: inv.target,
          status: inv.status,
          createdAt: inv.createdAt
        }))
      });
    } catch (error: unknown) {
      console.error("POST bulk scan route failure:", error);
      return NextResponse.json({
        success: false,
        error: "Error interno del servidor"
      }, { status: 500 });
    }
  }
);
