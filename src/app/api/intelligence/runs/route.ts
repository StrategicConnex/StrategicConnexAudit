import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceToolRuns,
  intelligenceFindings,
  intelligenceAssets
} from "@/shared/db/schemas";
import { runToolSchema } from "@/features/intelligence/validators/intelligence.schema";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { getToolDefinition } from "@/server/intelligence/registry/tool-registry";
import { executeTool } from "@/server/intelligence/core/dispatcher";

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

    // Verificar si la herramienta existe en el registro
    const toolDef = getToolDefinition(toolId);
    if (!toolDef) {
      return NextResponse.json({
        success: false,
        error: `Herramienta diagnóstica '${toolId}' no está registrada.`
      }, { status: 404 });
    }

    // Verificar acceso al proyecto a través de RLS
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // Validar el target del input
    const target = (input.target as string || "").trim().toLowerCase();
    if (!target) {
      return NextResponse.json({
        success: false,
        error: "Falta argumento 'target' en el input de la herramienta"
      }, { status: 400 });
    }

    // Control preventivo de SSRF
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

    // Despachar a nuestro motor dinámico técnico
    const executionResult = await executeTool(
      toolId,
      target,
      input,
      projectId,
      investigationId,
      user.id
    );

    const durationMs = Date.now() - tStart;
    const status = executionResult.success ? "completed" : "failed";

    // Guardar el registro de la ejecución del ejecutor real y sus findings si existiesen
    const record = await withRLS(user.id, async (tx) => {
      // 1. Insertar la ejecución de la herramienta
      const [insertedRun] = await tx.insert(intelligenceToolRuns).values({
        projectId,
        investigationId: investigationId || null,
        toolId,
        category: toolDef.category,
        status,
        input,
        output: executionResult.output,
        error: executionResult.error || null,
        durationMs,
        startedAt,
        completedAt: new Date()
      }).returning();

      // 2. Si hubo findings reales, insertarlos de forma atómica
      if (executionResult.findings && executionResult.findings.length > 0 && investigationId) {
        const findingsToInsert = executionResult.findings.map(finding => ({
          projectId,
          investigationId,
          toolRunId: insertedRun.id,
          severity: finding.severity as "info" | "low" | "medium" | "high" | "critical",
          confidence: String(Number(finding.confidence) || 0.7),
          title: finding.title,
          description: finding.description,
          recommendation: finding.remediation || finding.recommendation || null,
          evidence: (finding.evidence ?? {}) as Record<string, unknown>,
          affectedAsset: finding.affectedAsset ?? null,
        }));
        await tx.insert(intelligenceFindings).values(findingsToInsert);
      }

      return insertedRun;
    });

    return NextResponse.json({
      success: executionResult.success,
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

