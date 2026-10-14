import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import type { DbExecutor } from "@/shared/db/executor";
import { adversaryAssessments, adversaryVulnerabilities, projects } from "@/shared/db/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { assertProjectAccess } from "@/server/lib/project-access";
import type { runAdversaryAssessment } from "@/trigger/adversary-assessment.trigger";
import { withRequestContext, currentCorrelationId } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/intelligence/adversary/vulnerabilities
 * Body: { vulnerabilityId, falsePositive?: boolean, retest?: boolean }
 * - falsePositive: triage disclosure (solo proyecto accesible)
 * - retest: clona assessment para re-test (si no hay running)
 *
 * P0.2 · ADR-010: lecturas y escrituras corren dentro de `withRLS(user.id)`,
 * así que la sesión es `authenticated` y las policies de
 * `adversary_vulnerabilities` / `adversary_assessments` —que usan
 * `public.user_has_project_access(assessment.project_id)`— vuelven a acotar
 * cada fila. El `assertProjectAccess` explícito sigue siendo la primera
 * barrera (mismo criterio de membresía, mensaje 404 idéntico); la policy es la
 * segunda. Antes sólo existía la primera porque todo iba por `directDb`
 * (service role, `rolbypassrls`).
 */
const patchSchema = z.object({
  vulnerabilityId: z.string().uuid(),
  falsePositive: z.boolean().optional(),
  retest: z.boolean().optional(),
});

/** Resultados del bloque transaccional, mapeados a respuesta fuera de él. */
type Outcome =
  | { kind: "not_found_vuln" }
  | { kind: "not_found_assessment" }
  | { kind: "not_found_project" }
  | { kind: "no_authorization" }
  | { kind: "already_running" }
  | { kind: "ok"; retestAssessmentId: string | null };

async function rawPatch(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
    }

    const { vulnerabilityId, falsePositive, retest } = parsed.data;

    const outcome = await withRLS(user.id, async (tx: DbExecutor): Promise<Outcome> => {
      // La lectura entra por RLS: un no-miembro ve 0 filas → 404 sin que la
      // fila de otro tenant llegue siquiera a memoria del proceso.
      const [vuln] = await tx
        .select({ id: adversaryVulnerabilities.id, assessmentId: adversaryVulnerabilities.assessmentId })
        .from(adversaryVulnerabilities)
        .where(eq(adversaryVulnerabilities.id, vulnerabilityId))
        .limit(1);
      if (!vuln) return { kind: "not_found_vuln" };

      const [assessment] = await tx
        .select({ id: adversaryAssessments.id, projectId: adversaryAssessments.projectId })
        .from(adversaryAssessments)
        .where(eq(adversaryAssessments.id, vuln.assessmentId))
        .limit(1);
      if (!assessment) return { kind: "not_found_assessment" };

      // Primera barrera explícita (membresía, ADR-010). Usa service role SOLO
      // para leer membresía; la segunda barrera es la policy de RLS de arriba.
      const access = await assertProjectAccess(user.id, assessment.projectId);
      if (!access.ok) return { kind: "not_found_project" };

      if (typeof falsePositive === "boolean") {
        await tx
          .update(adversaryVulnerabilities)
          .set({ falsePositive })
          .where(eq(adversaryVulnerabilities.id, vulnerabilityId));
      }

      if (!retest) return { kind: "ok", retestAssessmentId: null };

      const project = await tx.query.projects.findFirst({
        where: eq(projects.id, assessment.projectId),
        columns: { id: true, domain: true, activeTestingAuthorized: true },
      });
      if (!project?.activeTestingAuthorized) {
        return { kind: "no_authorization" };
      }

      const [running] = await tx
        .select({ id: adversaryAssessments.id })
        .from(adversaryAssessments)
        .where(and(eq(adversaryAssessments.projectId, project.id), eq(adversaryAssessments.status, "running")))
        .limit(1);
      if (running) {
        return { kind: "already_running" };
      }

      const [created] = await tx
        .insert(adversaryAssessments)
        .values({ projectId: project.id, target: project.domain, status: "pending" })
        .returning({ id: adversaryAssessments.id });

      return { kind: "ok", retestAssessmentId: created?.id ?? null };
    });

    switch (outcome.kind) {
      case "not_found_vuln":
        return NextResponse.json({ success: false, error: "Vulnerabilidad no encontrada" }, { status: 404 });
      case "not_found_assessment":
        return NextResponse.json({ success: false, error: "Assessment no encontrado" }, { status: 404 });
      case "not_found_project":
        return NextResponse.json({ success: false, error: "Proyecto no encontrado" }, { status: 404 });
      case "no_authorization":
        return NextResponse.json({ success: false, error: "Proyecto sin autorización activa" }, { status: 403 });
      case "already_running":
        return NextResponse.json({ success: false, error: "Ya hay una evaluación en curso" }, { status: 409 });
      case "ok":
        break;
    }

    // El trigger (red) va FUERA de la transacción: así no se retiene una
    // conexión del pool (`max: 2`) durante una llamada HTTP al worker.
    if (outcome.retestAssessmentId) {
      const assessmentId = outcome.retestAssessmentId;
      try {
        const { tasks } = await import("@trigger.dev/sdk");
        await tasks.trigger<typeof runAdversaryAssessment>("adversary-real-assessment", {
          assessmentId,
          correlationId: currentCorrelationId(),
        });
      } catch (e) {
        logger.warn("vuln retest: Trigger.dev no disponible, fallback local", { error: e instanceof Error ? e.message : String(e) });
        void import("@/server/intelligence/adversary/assessment/assessment-service").then(({ executeAssessment }) =>
          executeAssessment(assessmentId).catch((err) => logger.error("vuln retest fallback error", { error: err }))
        );
      }
    }

    return NextResponse.json({ success: true, retestAssessmentId: outcome.retestAssessmentId });
  } catch (error) {
    logger.error("PATCH vulnerabilities failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export const PATCH = withRequestContext(rawPatch);
