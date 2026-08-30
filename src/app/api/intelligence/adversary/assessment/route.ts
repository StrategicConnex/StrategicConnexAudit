import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/db";
import {
  adversaryAssessments,
  adversaryVulnerabilities,
  projects,
} from "@/shared/db/schemas";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { tasks } from "@trigger.dev/sdk";
import { runAdversaryAssessment } from "@/trigger/adversary-assessment.trigger";
import { extractTargetHost } from "@/server/intelligence/adversary/sandbox-executor";
import { failStaleAssessments } from "@/server/intelligence/adversary/assessment/assessment-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SECURITY: igual que /api/intelligence/adversary — ownership obligatorio.
 * Además el gate LEGAL: solo se lanza una evaluación real si
 * projects.active_testing_authorized = true (consentimiento explícito).
 */

async function getOwnedProject(userId: string, projectId: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    columns: {
      id: true,
      domain: true,
      activeTestingAuthorized: true,
      isDeleted: true,
      deletedAt: true,
    },
  });
}

const postSchema = z.object({
  projectId: z.string().uuid(),
});

/**
 * POST /api/intelligence/adversary/assessment
 * Crea la evaluación y la dispara en Trigger.dev (fallback: proceso local).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "projectId inválido" }, { status: 400 });
    }

    const project = await getOwnedProject(user.id, parsed.data.projectId);
    if (!project || project.isDeleted || project.deletedAt) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    // ── GATE LEGAL: sin consentimiento explícito no hay testing activo ──
    if (!project.activeTestingAuthorized) {
      return NextResponse.json(
        { success: false, error: "Este proyecto no tiene autorización de evaluación activa. Actívala en la pestaña Adversario." },
        { status: 403 }
      );
    }

    const host = extractTargetHost(project.domain);
    if (!host) {
      return NextResponse.json({ success: false, error: "El proyecto no tiene un dominio válido" }, { status: 400 });
    }

    // Evitar evaluaciones concurrentes sobre el mismo proyecto
    const [running] = await db
      .select({ id: adversaryAssessments.id })
      .from(adversaryAssessments)
      .where(and(
        eq(adversaryAssessments.projectId, project.id),
        eq(adversaryAssessments.status, "running")
      ))
      .limit(1);
    if (running) {
      return NextResponse.json(
        { success: false, error: "Ya hay una evaluación en curso", assessmentId: running.id },
        { status: 409 }
      );
    }

    const [assessment] = await db
      .insert(adversaryAssessments)
      .values({ projectId: project.id, target: host, status: "pending" })
      .returning();

    try {
      await tasks.trigger<typeof runAdversaryAssessment>("adversary-real-assessment", {
        assessmentId: assessment!.id,
      });
    } catch (triggerErr) {
      // Fallback local (dev / Trigger.dev caído): ejecuta en background del proceso
      logger.warn("assessment: Trigger.dev no disponible, fallback local", { error: triggerErr instanceof Error ? triggerErr.message : triggerErr });
      void import("@/server/intelligence/adversary/assessment/assessment-service").then(({ executeAssessment }) =>
        executeAssessment(assessment!.id).catch((e) => logger.error("assessment: fallback error", { error: e }))
      );
    }

    return NextResponse.json({ success: true, assessmentId: assessment!.id });
  } catch (error: unknown) {
    logger.error("Error en POST assessment", { error });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * GET /api/intelligence/adversary/assessment?projectId=&assessmentId?
 * Lista las evaluaciones del proyecto (o el detalle de una) + vulnerabilidades.
 * PATCH-like: también sirve para actualizar consentimiento vía PUT.
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
    const assessmentId = searchParams.get("assessmentId");

    if (!projectId || !z.string().uuid().safeParse(projectId).success) {
      return NextResponse.json({ success: false, error: "projectId requerido" }, { status: 400 });
    }

    const project = await getOwnedProject(user.id, projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    // Recovery: marca como failed las evaluaciones huérfanas (worker muerto)
    // para que el polling no muestre una barra congelada indefinidamente.
    await failStaleAssessments();

    if (assessmentId) {
      const [assessment] = await db
        .select()
        .from(adversaryAssessments)
        .where(and(eq(adversaryAssessments.id, assessmentId), eq(adversaryAssessments.projectId, projectId)))
        .limit(1);
      if (!assessment) {
        return NextResponse.json({ success: false, error: "Evaluación no encontrada" }, { status: 404 });
      }
      const vulnerabilities = await db
        .select()
        .from(adversaryVulnerabilities)
        .where(eq(adversaryVulnerabilities.assessmentId, assessmentId))
        .orderBy(desc(adversaryVulnerabilities.cvssScore));
      return NextResponse.json({
        success: true,
        authorized: project.activeTestingAuthorized,
        assessment,
        vulnerabilities,
      });
    }

    const assessments = await db
      .select()
      .from(adversaryAssessments)
      .where(eq(adversaryAssessments.projectId, projectId))
      .orderBy(desc(adversaryAssessments.createdAt))
      .limit(20);

    return NextResponse.json({
      success: true,
      authorized: project.activeTestingAuthorized,
      domain: project.domain,
      assessments,
    });
  } catch (error: unknown) {
    logger.error("Error en GET assessment", { error });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

const putSchema = z.object({
  projectId: z.string().uuid(),
  activeTestingAuthorized: z.boolean(),
});

/** PUT — actualiza el consentimiento de evaluación activa (gate legal). */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
    }

    const owned = await getOwnedProject(user.id, parsed.data.projectId);
    if (!owned) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
    }

    await db
      .update(projects)
      .set({ activeTestingAuthorized: parsed.data.activeTestingAuthorized, updatedAt: new Date() })
      .where(eq(projects.id, parsed.data.projectId));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error("Error en PUT assessment", { error });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
