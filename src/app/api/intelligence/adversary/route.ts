import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/db";
import { adversaryScenarios, adversaryRuns } from "@/shared/db/schemas/adversary";
import { intelligenceInvestigations } from "@/shared/db/schemas/intelligence";
import { eq, isNull, desc } from "drizzle-orm";
import { ADVERSARY_CATALOG } from "@/server/intelligence/adversary/catalog";
import { runScenario, listScenariosWithRuns } from "@/server/intelligence/adversary/scenario-runner";

export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/adversary
 * Devuelve el catálogo de escenarios + historial de ejecuciones para un proyecto.
 * Query params: projectId (required)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId es requerido" },
        { status: 400 }
      );
    }

    // Get runs for this project
    const runs = await db
      .select()
      .from(adversaryRuns)
      .where(eq(adversaryRuns.projectId, projectId))
      .orderBy(desc(adversaryRuns.createdAt))
      .limit(50);

    // Enrich catalog with run history
    const catalog = ADVERSARY_CATALOG.map((scenario) => {
      const scenarioRuns = runs.filter((r) => {
        // Match by mitreId via scenario lookup
        return true; // Simplified for MVP — all runs shown
      });

      const lastRun = runs[0] || null;
      const detectedCount = runs.filter((r) => r.result === "detected").length;

      return {
        mitreId: scenario.mitreId,
        mitreTactic: scenario.mitreTactic,
        mitreTechnique: scenario.mitreTechnique,
        name: scenario.name,
        description: scenario.description,
        detectionAdvice: scenario.detectionAdvice,
        severity: scenario.severity,
        executorType: scenario.executorType,
        prerequisites: scenario.prerequisites,
        tags: scenario.tags,
        lastRun,
        totalRuns: runs.length,
        detectedCount,
        detectionRate: runs.length > 0
          ? Math.round((detectedCount / runs.length) * 100)
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      catalog,
      runs,
      totalRuns: runs.length,
      coverage: {
        totalScenarios: ADVERSARY_CATALOG.length,
        executedScenarios: runs.length > 0 ? new Set(runs.map((r) => r.scenarioId)).size : 0,
        detectedCount: runs.filter((r) => r.result === "detected").length,
        missedCount: runs.filter((r) => r.result === "missed").length,
      },
    });
  } catch (error: any) {
    console.error("Error en GET /api/intelligence/adversary:", error.message);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/intelligence/adversary
 * Ejecuta un escenario de simulación de adversario.
 * Body: { scenarioMitreId, projectId, investigationId?, detectedBy?, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { scenarioMitreId, projectId, investigationId, detectedBy, notes } = body;

    if (!scenarioMitreId || !projectId) {
      return NextResponse.json(
        { success: false, error: "scenarioMitreId y projectId son requeridos" },
        { status: 400 }
      );
    }

    const result = await runScenario({
      scenarioMitreId,
      projectId,
      investigationId,
      detectedBy,
      notes,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      runId: result.runId,
      result: result.result,
      scoreImpact: result.scoreImpact,
      output: result.output,
    });
  } catch (error: any) {
    console.error("Error en POST /api/intelligence/adversary:", error.message);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/intelligence/adversary/:runId
 * Reporta el resultado de una simulación (detectado/no detectado).
 * Body: { result: "detected" | "missed", detectedBy?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { runId, result, detectedBy } = body;

    if (!runId || !result) {
      return NextResponse.json(
        { success: false, error: "runId y result son requeridos" },
        { status: 400 }
      );
    }

    if (!["detected", "missed", "error"].includes(result)) {
      return NextResponse.json(
        { success: false, error: "result debe ser: detected, missed, o error" },
        { status: 400 }
      );
    }

    await db
      .update(adversaryRuns)
      .set({
        result,
        detectedBy: detectedBy || null,
        completedAt: new Date(),
      })
      .where(eq(adversaryRuns.id, runId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en PATCH /api/intelligence/adversary:", error.message);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
