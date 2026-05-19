import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import dns from "node:dns/promises";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceToolRuns,
  intelligenceInvestigations
} from "@/shared/db/schemas";
import { runToolSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { getToolDefinition } from "@/server/intelligence/registry/tool-registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    if (!projectId && !investigationId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere 'projectId' o 'investigationId' para listar ejecuciones"
      }, { status: 400 });
    }

    const runs = await withRLS(user.id, async (tx) => {
      if (investigationId) {
        return await tx.query.intelligenceToolRuns.findMany({
          where: eq(intelligenceToolRuns.investigationId, investigationId),
          orderBy: [desc(intelligenceToolRuns.completedAt)]
        });
      }
      
      if (projectId) {
        return await tx.query.intelligenceToolRuns.findMany({
          where: eq(intelligenceToolRuns.projectId, projectId!),
          orderBy: [desc(intelligenceToolRuns.completedAt)]
        });
      }

      return [];
    });

    return NextResponse.json({
      success: true,
      runs
    });

  } catch (error: any) {
    console.error("GET intelligence runs failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al obtener ejecuciones: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserOrThrow();
    const body = await req.json();

    const parseResult = runToolSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        error: "Argumentos inválidos: " + parseResult.error.issues.map(i => i.message).join(", ")
      }, { status: 400 });
    }

    const { projectId, investigationId, toolId, input } = parseResult.data;

    // Check tool exists in registry
    const toolDef = getToolDefinition(toolId);
    if (!toolDef) {
      return NextResponse.json({
        success: false,
        error: `Herramienta diagnóstica '${toolId}' no está registrada.`
      }, { status: 404 });
    }

    // Verify project access in RLS
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // Validate target inside input
    const target = (input.target as string || "").trim().toLowerCase();
    if (!target) {
      return NextResponse.json({
        success: false,
        error: "Falta argumento 'target' en el input de la herramienta"
      }, { status: 400 });
    }

    // SSRF target check
    try {
      await assertPublicHostname(target);
    } catch (ssrfError: any) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${ssrfError.message}`
      }, { status: 403 });
    }

    const startedAt = new Date();
    const tStart = Date.now();

    // Execute ad-hoc tool logic
    let output: any = {};
    let errorStr: string | null = null;
    let status: "completed" | "failed" = "completed";

    try {
      if (toolId === "dns_lookup") {
        const [a, mx, txt] = await Promise.all([
          dns.resolve(target, "A").catch(() => []),
          dns.resolve(target, "MX").catch(() => []),
          dns.resolve(target, "TXT").catch(() => [])
        ]);
        output = { A: a, MX: mx, TXT: txt };
      } else {
        // Fallback or generic dynamic handler for ad-hoc tool simulation
        output = {
          message: `Ejecución simulada exitosa de herramienta ${toolId}`,
          target,
          executedAt: new Date().toISOString()
        };
      }
    } catch (err: any) {
      status = "failed";
      errorStr = err.message || "Fallo en ejecución de herramienta";
      output = { error: errorStr };
    }

    const durationMs = Date.now() - tStart;

    // Save ad-hoc tool run record
    const record = await withRLS(user.id, async (tx) => {
      const [inserted] = await tx.insert(intelligenceToolRuns).values({
        projectId,
        investigationId: investigationId || null,
        toolId,
        category: toolDef.category,
        status,
        input,
        output,
        error: errorStr,
        durationMs,
        startedAt,
        completedAt: new Date()
      }).returning();
      return inserted;
    });

    return NextResponse.json({
      success: status === "completed",
      run: record
    });

  } catch (error: any) {
    console.error("POST intelligence run failure:", error);
    return NextResponse.json({
      success: false,
      error: error.message === "No autorizado" ? "No autorizado" : `Error al ejecutar herramienta: ${error.message || error}`
    }, { status: error.message === "No autorizado" ? 401 : 500 });
  }
}
