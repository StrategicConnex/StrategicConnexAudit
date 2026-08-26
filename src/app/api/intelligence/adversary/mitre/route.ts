import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/db";
import {
  mitreEvaluations,
  mitreTechniqueResults,
  projects,
} from "@/shared/db/schemas";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk";
import { runMitreEvaluationTask } from "@/trigger/mitre-evaluation.trigger";
import { extractTargetHost } from "@/server/intelligence/adversary/sandbox-executor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Evaluación Real de Cobertura MITRE — mismos gates que /assessment:
 * ownership obligatorio + projects.active_testing_authorized (consentimiento).
 */

async function getOwnedProject(userId: string, projectId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    columns: { id: true, domain: true, activeTestingAuthorized: true },
  });
}

const postSchema = z.object({ projectId: z.string().uuid() });

/** POST — lanza el batch de evaluación MITRE real. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "projectId inválido" }, { status: 400 });
    }

    const project = await getOwnedProject(user.id, parsed.data.projectId);
    if (!project) return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });

    if (!project.activeTestingAuthorized) {
      return NextResponse.json(
        { success: false, error: "Este proyecto no tiene autorización de evaluación activa." },
        { status: 403 }
      );
    }

    const host = extractTargetHost(project.domain);
    if (!host) {
      return NextResponse.json({ success: false, error: "El proyecto no tiene dominio válido" }, { status: 400 });
    }

    // Evitar batches concurrentes del mismo proyecto
    const [running] = await db
      .select({ id: mitreEvaluations.id })
      .from(mitreEvaluations)
      .where(and(eq(mitreEvaluations.projectId, project.id), eq(mitreEvaluations.status, "running")))
      .limit(1);
    if (running) {
      return NextResponse.json(
        { success: false, error: "Ya hay una evaluación MITRE en curso", evaluationId: running.id },
        { status: 409 }
      );
    }

    const [evaluation] = await db
      .insert(mitreEvaluations)
      .values({ projectId: project.id, target: host, status: "pending" })
      .returning();

    try {
      await tasks.trigger<typeof runMitreEvaluationTask>("mitre-real-evaluation", {
        evaluationId: evaluation!.id,
      });
    } catch (err) {
      console.warn("[mitre] Trigger.dev no disponible, fallback local:", err instanceof Error ? err.message : err);
      void import("@/server/intelligence/adversary/mitre-eval/mitre-service").then(({ executeMitreEvaluation }) =>
        executeMitreEvaluation(evaluation!.id).catch((e) => console.error("[mitre] fallback error:", e))
      );
    }

    return NextResponse.json({ success: true, evaluationId: evaluation!.id });
  } catch (error: unknown) {
    console.error("Error en POST mitre:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * GET — lista evaluaciones (o detalle de una con resultados por técnica).
 * Query: projectId (req), evaluationId (opt)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const evaluationId = searchParams.get("evaluationId");

    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return NextResponse.json({ success: false, error: "projectId requerido" }, { status: 400 });
    }
    if (!(await getOwnedProject(user.id, projectId))) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    if (evaluationId) {
      const [evaluation] = await db
        .select()
        .from(mitreEvaluations)
        .where(and(eq(mitreEvaluations.id, evaluationId), eq(mitreEvaluations.projectId, projectId)))
        .limit(1);
      if (!evaluation) {
        return NextResponse.json({ success: false, error: "Evaluación no encontrada" }, { status: 404 });
      }
      const results = await db
        .select()
        .from(mitreTechniqueResults)
        .where(eq(mitreTechniqueResults.evaluationId, evaluationId))
        .orderBy(asc(mitreTechniqueResults.mitreId));
      return NextResponse.json({ success: true, evaluation, results });
    }

    const evaluations = await db
      .select()
      .from(mitreEvaluations)
      .where(eq(mitreEvaluations.projectId, projectId))
      .orderBy(desc(mitreEvaluations.createdAt))
      .limit(20);

    return NextResponse.json({ success: true, evaluations });
  } catch (error: unknown) {
    console.error("Error en GET mitre:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
