import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { directDb } from "@/shared/db";
import { adversaryAssessments, adversaryVulnerabilities, projects } from "@/shared/db/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { assertProjectAccess } from "@/server/lib/project-access";
import type { runAdversaryAssessment } from "@/trigger/adversary-assessment.trigger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/intelligence/adversary/vulnerabilities
 * Body: { vulnerabilityId, falsePositive?: boolean, retest?: boolean }
 * - falsePositive: triage disclosure (solo proyecto accesible)
 * - retest: clona assessment para re-test (si no hay running)
 */
const patchSchema = z.object({
  vulnerabilityId: z.string().uuid(),
  falsePositive: z.boolean().optional(),
  retest: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
    }

    const { vulnerabilityId, falsePositive, retest } = parsed.data;

    const [vuln] = await directDb
      .select({ id: adversaryVulnerabilities.id, assessmentId: adversaryVulnerabilities.assessmentId })
      .from(adversaryVulnerabilities)
      .where(eq(adversaryVulnerabilities.id, vulnerabilityId))
      .limit(1);
    if (!vuln) return NextResponse.json({ success: false, error: "Vulnerabilidad no encontrada" }, { status: 404 });

    const [assessment] = await directDb
      .select({ id: adversaryAssessments.id, projectId: adversaryAssessments.projectId })
      .from(adversaryAssessments)
      .where(eq(adversaryAssessments.id, vuln.assessmentId))
      .limit(1);
    if (!assessment) return NextResponse.json({ success: false, error: "Assessment no encontrado" }, { status: 404 });

    const access = await assertProjectAccess(user.id, assessment.projectId);
    if (!access.ok) return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });

    if (typeof falsePositive === "boolean") {
      await directDb
        .update(adversaryVulnerabilities)
        .set({ falsePositive })
        .where(eq(adversaryVulnerabilities.id, vulnerabilityId));
    }

    let retestAssessmentId: string | null = null;
    if (retest) {
      const project = await directDb.query.projects.findFirst({
        where: eq(projects.id, assessment.projectId),
        columns: { id: true, domain: true, activeTestingAuthorized: true },
      });
      if (!project?.activeTestingAuthorized) {
        return NextResponse.json({ success: false, error: "Proyecto sin autorización activa" }, { status: 403 });
      }
      const [running] = await directDb
        .select({ id: adversaryAssessments.id })
        .from(adversaryAssessments)
        .where(and(eq(adversaryAssessments.projectId, project.id), eq(adversaryAssessments.status, "running")))
        .limit(1);
      if (running) {
        return NextResponse.json({ success: false, error: "Ya hay una evaluación en curso" }, { status: 409 });
      }
      const target = project.domain;
      const [created] = await directDb
        .insert(adversaryAssessments)
        .values({ projectId: project.id, target, status: "pending" })
        .returning({ id: adversaryAssessments.id });
      if (created) {
        retestAssessmentId = created.id;
        try {
          const { tasks } = await import("@trigger.dev/sdk");
          await tasks.trigger<typeof runAdversaryAssessment>("adversary-real-assessment", {
            assessmentId: created.id,
          });
        } catch (e) {
          logger.warn("vuln retest: Trigger.dev no disponible, fallback local", { error: e instanceof Error ? e.message : String(e) });
          void import("@/server/intelligence/adversary/assessment/assessment-service").then(({ executeAssessment }) =>
            executeAssessment(created.id).catch((err) => logger.error("vuln retest fallback error", { error: err }))
          );
        }
      }
    }

    return NextResponse.json({ success: true, retestAssessmentId });
  } catch (error) {
    logger.error("PATCH vulnerabilities failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
