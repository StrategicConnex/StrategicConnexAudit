import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations
} from "@/shared/db/schemas";
import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const bulkScanSchema = z.object({
  projectId: z.string().uuid(),
  targets: z.array(z.string().min(1).max(256)).min(1).max(10) // Limit to max 10 domains at once for safety
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = bulkScanSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { projectId, targets } = parseResult.data;

    // Check authorization on project
    const project = await withRLS(user.id, async (tx) => {
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

      // 1. Insert a placeholder investigation as "running"
      const investigation = await withRLS(user.id, async (tx) => {
        let targetType: "domain" | "hostname" | "url" | "ip" | "email" = "domain";
        if (cleanTarget.includes("@")) {
          targetType = "email";
        } else if (cleanTarget.includes("://")) {
          targetType = "url";
        }

        const [record] = await tx.insert(intelligenceInvestigations).values({
          projectId,
          ownerId: user.id,
          title: `Escaneo Masivo: ${cleanTarget}`,
          target: cleanTarget,
          normalizedTarget: cleanTarget,
          targetType,
          status: "running"
        }).returning();

        return record;
      });

      queuedInvestigations.push(investigation);

      // 2. Fire-and-forget background execution using our established intelligence route
      // We pass the active user session headers/cookies so that the background endpoint passes auth checks
      const targetUrl = new URL("/api/intelligence", req.nextUrl.origin);
      
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

  } catch (error: any) {
    console.error("POST bulk scan route failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error interno: ${error.message || error}`
    }, { status: 500 });
  }
}
