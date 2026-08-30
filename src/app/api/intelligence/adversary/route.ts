import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient } from "@/shared/lib/supabase/server";
import { db, directDb } from "@/shared/db";
import {
  adversaryRuns,
  projects,
} from "@/shared/db/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ADVERSARY_CATALOG } from "@/server/intelligence/adversary/catalog";
import { runScenario, listScenariosWithRuns } from "@/server/intelligence/adversary/scenario-runner";

export const dynamic = "force-dynamic";

/**
 * SECURITY: todos los verbos verifican que el proyecto (o el run) pertenece
 * al usuario autenticado. Antes de este fix, GET/POST/PATCH operaban sobre
 * cualquier projectId/runId sin autorización (IDOR cross-tenant) y POST
 * permitía usar la plataforma como scanner-for-hire contra dominios ajenos.
 */
async function assertProjectOwnership(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    columns: { id: true },
  });
  return !!project;
}

const postSchema = z.object({
  scenarioMitreId: z.string().min(1).max(64),
  projectId: z.string().uuid(),
  investigationId: z.string().uuid().optional(),
  detectedBy: z.string().max(128).optional(),
  notes: z.string().max(2048).optional(),
});

const patchSchema = z.object({
  runId: z.string().uuid(),
  result: z.enum(["detected", "missed", "error"]),
  detectedBy: z.string().max(128).optional(),
});

const patchLooseSchema = z.object({
  runId: z.string().uuid().optional(),
  result: z.string().optional(),
  detectedBy: z.string().max(128).optional(),
});

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

    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return NextResponse.json(
        { success: false, error: "projectId es requerido" },
        { status: 400 }
      );
    }

    if (!(await assertProjectOwnership(user.id, projectId))) {
      return NextResponse.json(
        { success: false, error: "Proyecto no encontrado o sin acceso" },
        { status: 404 }
      );
    }

    // Runs del proyecto (raw, desc) + catálogo enriquecido con estadísticas
    // por escenario. El filtrado por scenario_id vive en listScenariosWithRuns
    // (fix P0: antes se atribuían TODOS los runs a TODOS los escenarios).
    const { catalog, runs } = await listScenariosWithRuns(projectId);

    return NextResponse.json({
      success: true,
      catalog,
      runs,
      totalRuns: runs.length,
      coverage: {
        totalScenarios: ADVERSARY_CATALOG.length,
        executedScenarios: runs.length > 0 ? new Set(runs.map((r) => r.scenarioId).filter(Boolean)).size : 0,
        detectedCount: runs.filter((r) => r.result === "detected").length,
        missedCount: runs.filter((r) => r.result === "missed").length,
      },
    });
  } catch (error: unknown) {
    logger.error("Error en GET /api/intelligence/adversary", { error });
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
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "scenarioMitreId y projectId son requeridos" },
        { status: 400 }
      );
    }

    const { scenarioMitreId, projectId, investigationId, detectedBy, notes } = parsed.data;

    if (!(await assertProjectOwnership(user.id, projectId))) {
      return NextResponse.json(
        { success: false, error: "Proyecto no encontrado o sin acceso" },
        { status: 404 }
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
  } catch (error: unknown) {
    logger.error("Error en POST /api/intelligence/adversary", { error });
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
    const loose = patchLooseSchema.safeParse(body);
    if (!loose.success || !loose.data.runId || !loose.data.result) {
      return NextResponse.json(
        { success: false, error: "runId y result son requeridos" },
        { status: 400 }
      );
    }

    if (!["detected", "missed", "error"].includes(loose.data.result)) {
      return NextResponse.json(
        { success: false, error: "result debe ser: detected, missed, o error" },
        { status: 400 }
      );
    }

    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      // El valor era válido pero el formato de runId no (uuid requerido)
      return NextResponse.json(
        { success: false, error: "runId debe ser un UUID válido" },
        { status: 400 }
      );
    }

    const { runId, result, detectedBy } = parsed.data;

    // SECURITY: solo el dueño del proyecto del run puede modificarlo
    const owned = await directDb
      .select({ ownerId: projects.ownerId })
      .from(adversaryRuns)
      .innerJoin(projects, eq(projects.id, adversaryRuns.projectId))
      .where(eq(adversaryRuns.id, runId))
      .limit(1);

    if (!owned[0] || owned[0].ownerId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Run no encontrado o sin acceso" },
        { status: 404 }
      );
    }

    await directDb
      .update(adversaryRuns)
      .set({
        result,
        detectedBy: detectedBy || null,
        completedAt: new Date(),
      })
      .where(eq(adversaryRuns.id, runId));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error("Error en PATCH /api/intelligence/adversary", { error });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
