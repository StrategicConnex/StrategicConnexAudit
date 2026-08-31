/**
 * assessment-service.ts — Ciclo de vida de una Evaluación Real.
 *
 * Orquesta el flujo completo referenciado por su id en BD:
 *   pending → running (checks reales) → analyzing (agente AI) → completed
 *   └→ failed (cualquier error fatal; la evidencia parcial se conserva)
 *
 * Persiste vulnerabilidades clasificadas y las replica como hallazgos
 * [ADV-REAL] en intelligence_findings para visibilidad unificada.
 */

import { directDb } from "@/shared/db";
import {
  adversaryAssessments,
  adversaryVulnerabilities,
} from "@/shared/db/schemas/adversary";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { projects } from "@/shared/db/schemas";
import { and, eq, inArray, lt } from "drizzle-orm";
import { runRealAssessment } from "./assessment-runner";
import { analyzeAssessment } from "./ai-analyst";
import { logger } from "@/lib/logger";

/**
 * Recovery: una fila `pending` sin worker (p.ej. Trigger.dev dev CLI caído)
 * o un `running`/`analyzing` zombi bloquean la UI para siempre. El polling
 * del runner refresca `updatedAt` en cada check, así que solo caducan filas
 * realmente huérfanas.
 */
const PENDING_STALE_MS = 2 * 60 * 1000;
const ACTIVE_STALE_MS = 15 * 60 * 1000;

export async function failStaleAssessments(): Promise<void> {
  const now = new Date();
  try {
    await directDb
      .update(adversaryAssessments)
      .set({
        status: "failed",
        error: "Timeout: la evaluación nunca inició (¿Trigger.dev worker activo?). Relanza la evaluación.",
        completedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(adversaryAssessments.status, "pending"),
        lt(adversaryAssessments.updatedAt, new Date(now.getTime() - PENDING_STALE_MS)),
      ));
    await directDb
      .update(adversaryAssessments)
      .set({
        status: "failed",
        error: "Timeout: la evaluación quedó sin progreso. Relánzala.",
        completedAt: now,
        updatedAt: now,
      })
      .where(and(
        inArray(adversaryAssessments.status, ["running", "analyzing"]),
        lt(adversaryAssessments.updatedAt, new Date(now.getTime() - ACTIVE_STALE_MS)),
      ));
  } catch (err) {
    logger.error("[assessment] failStaleAssessments falló (no bloqueante):", err instanceof Error ? err.message : err);
  }
}

export async function executeAssessment(assessmentId: string): Promise<void> {
  const [assessment] = await directDb
    .select({
      id: adversaryAssessments.id,
      target: adversaryAssessments.target,
      projectId: adversaryAssessments.projectId,
    })
    .from(adversaryAssessments)
    .innerJoin(projects, eq(projects.id, adversaryAssessments.projectId))
    .where(eq(adversaryAssessments.id, assessmentId))
    .limit(1);

  if (!assessment) throw new Error(`Assessment ${assessmentId} no encontrado`);

  const [project] = await directDb
    .select({ name: projects.name, domain: projects.domain, ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, assessment.projectId))
    .limit(1);

  const projectName = project?.name ?? assessment.target;

  try {
    // 1. Fase de ejecución real
    await directDb
      .update(adversaryAssessments)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(adversaryAssessments.id, assessmentId));

    const run = await runRealAssessment({
      target: assessment.target,
      // Progreso en vivo: la UI hace polling y lee current_step/checks_done.
      // Fire-and-forget: un fallo de esta UPDATE jamás aborta la evaluación.
      onProgress: ({ done, currentStep }) => {
        directDb
          .update(adversaryAssessments)
          .set({ checksDone: done, currentStep, updatedAt: new Date() })
          .where(eq(adversaryAssessments.id, assessmentId))
          .catch(() => { /* progreso no bloqueante */ });
      },
    });
    if (!run.success || !run.evidence) {
      throw new Error(run.error ?? "El motor de evaluación no devolvió evidencia");
    }

    await directDb
      .update(adversaryAssessments)
      .set({
        status: "analyzing",
        currentStep: "análisis AI",
        evidenceCount: run.evidence.checks.length,
        checksTotal: run.evidence.checks.length,
        checksPassed: run.evidence.checks.filter((c) => c.status === "pass").length,
        rawEvidence: run.evidence as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(adversaryAssessments.id, assessmentId));

    // 2. Fase de análisis AI (con contexto de ownership para las tools)
    const analysis = await analyzeAssessment(run.evidence, projectName, {
      userId: project?.ownerId ?? "",
      assessmentId,
      projectId: assessment.projectId,
    });

    if (!analysis.success && analysis.analysisFailed) {
      // Evidencia conservada; la UI muestra el modo crudo
      await directDb
        .update(adversaryAssessments)
        .set({
          status: "completed",
          analysisFailed: true,
          summary: analysis.error ?? "Análisis AI fallido — evidencia cruda disponible",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(adversaryAssessments.id, assessmentId));
      return;
    }

    // 3. Persistir vulnerabilidades
    for (const vuln of analysis.vulnerabilities) {
      await directDb.insert(adversaryVulnerabilities).values({
        assessmentId,
        title: vuln.title,
        severity: vuln.severity,
        cvssScore: String(vuln.cvssScore),
        cweId: vuln.cweId ?? null,
        owaspCategory: vuln.owaspCategory ?? null,
        mitreId: vuln.mitreId ?? null,
        description: vuln.description,
        evidence: { summary: vuln.evidenceSummary },
        remediation: vuln.remediation,
        references: vuln.references ?? [],
        confidence: String(vuln.confidence),
        aiModel: analysis.modelUsed ?? null,
      });

      // Réplica en findings unificados del dashboard.
      // SECURITY/robustez: usa directDb (conexión de servicio, bypass RLS) —
      // es un job background sin request context; el pool RLS (`db`) depende
      // de request.jwt.claims y falla en runtimes sin sesión (visto en prod).
      // Además, la réplica NUNCA debe romper el assessment: los datos
      // canónicos ya están en adversary_vulnerabilities.
      try {
        await directDb.insert(intelligenceFindings).values({
          investigationId: null,
          projectId: assessment.projectId,
          severity: vuln.severity,
          confidence: String(vuln.confidence),
          title: `[ADV-REAL] ${vuln.title}`,
          description: `${vuln.description}\n\nEvidencia: ${vuln.evidenceSummary}`,
          recommendation: vuln.remediation.map((r, i) => `${i + 1}. ${r}`).join("\n"),
          evidence: {
            assessmentId,
            cweId: vuln.cweId ?? null,
            owaspCategory: vuln.owaspCategory ?? null,
            mitreId: vuln.mitreId ?? null,
            cvssScore: vuln.cvssScore,
            references: vuln.references ?? [],
            aiModel: analysis.modelUsed ?? null,
          },
          affectedAsset: assessment.target,
        });
      } catch (findingErr) {
        // No bloqueante: log con causa pg para diagnóstico, sigue con el resto
        const cause = (findingErr as { cause?: { message?: string } })?.cause?.message ?? "";
        logger.error("[assessment] réplica finding falló (no bloqueante):", cause || String(findingErr));
      }
    }

    // 4. Cerrar con resumen ejecutivo
    await directDb
      .update(adversaryAssessments)
      .set({
        status: "completed",
        riskScore: analysis.executive?.riskScore ?? null,
        summary: analysis.executive?.summary ??
          `${analysis.vulnerabilities.length} vulnerabilidad(es) confirmadas.`,
        modelUsed: analysis.modelUsed ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adversaryAssessments.id, assessmentId));
  } catch (err) {
    // Sanitizado: nunca persistas el dump SQL de Drizzle crudo (se renderiza
    // en la UI). Mensaje corto + causa pg real para diagnóstico.
    const raw = err instanceof Error ? err.message : String(err);
    const cause = (err as { cause?: { message?: string; detail?: string } })?.cause;
    const short = raw.startsWith("Failed query")
      ? "Fallo de base de datos al persistir la evaluación"
      : raw.slice(0, 300);
    const errorText = cause?.message
      ? `${short} | causa: ${cause.message.slice(0, 200)}${cause.detail ? ` (${cause.detail.slice(0, 120)})` : ""}`
      : short;
    await directDb
      .update(adversaryAssessments)
      .set({
        status: "failed",
        error: errorText,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adversaryAssessments.id, assessmentId));
  }
}
