import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceAssets,
  intelligenceRunEvents
} from "@/shared/db/schemas";
import { createInvestigationSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    const result = await withRLS(user.id, async (tx) => {
      if (investigationId) {
        const investigation = await tx.query.intelligenceInvestigations.findFirst({
          where: eq(intelligenceInvestigations.id, investigationId)
        });

        if (!investigation) {
          return { success: false, status: 404, error: "Investigación no encontrada" };
        }

        const findings = await tx.query.intelligenceFindings.findMany({
          where: eq(intelligenceFindings.investigationId, investigationId)
        });

        const events = await tx.query.intelligenceRunEvents.findMany({
          where: eq(intelligenceRunEvents.investigationId, investigationId),
          orderBy: [desc(intelligenceRunEvents.createdAt)]
        });

        const assets = await tx.query.intelligenceAssets.findMany({
          where: eq(intelligenceAssets.investigationId, investigationId)
        });

        return {
          success: true,
          status: 200,
          data: { investigation, findings, events, assets }
        };
      }

      if (!projectId) {
        return { success: false, status: 400, error: "Falta ID de proyecto" };
      }

      const list = await tx.query.intelligenceInvestigations.findMany({
        where: eq(intelligenceInvestigations.projectId, projectId),
        orderBy: [desc(intelligenceInvestigations.createdAt)]
      });

      return {
        success: true,
        status: 200,
        data: { investigations: list }
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result.data
    });
  } catch (error: any) {
    console.error("GET intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al obtener las investigaciones: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const body = await req.json();
    
    const parseResult = createInvestigationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Argumentos inválidos: " + parseResult.error.issues.map(i => i.message).join(", ") 
      }, { status: 400 });
    }

    const { projectId, target, template } = parseResult.data;

    // Check project authorization inside RLS context
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // SSRF Prevention validation via Egress Guard
    try {
      await assertPublicHostname(target.trim().toLowerCase());
    } catch (ssrfError: any) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${ssrfError.message}`
      }, { status: 403 });
    }

    // Create investigation
    const investigation = await withRLS(user.id, async (tx) => {
      const [record] = await tx.insert(intelligenceInvestigations).values({
        projectId,
        ownerId: user.id,
        title: `Auditoría de Infraestructura para ${target}`,
        target,
        normalizedTarget: target.trim().toLowerCase(),
        targetType: "domain",
        status: "running"
      }).returning();
      return record;
    });

    // In a fully production system, this would queue a Trigger.dev task or run a background worker.
    // For compatibility and instant result display in UI, we can launch the synchronous diagnostics
    // in a non-blocking way, or return the initial state. Since it is modularized, we return the running status.
    return NextResponse.json({
      success: true,
      investigation: {
        id: investigation.id,
        title: investigation.title,
        target: investigation.target,
        normalizedTarget: investigation.normalizedTarget,
        status: "running",
        score: null,
      }
    });

  } catch (error: any) {
    console.error("POST intelligence investigations failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al crear la investigación: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}
