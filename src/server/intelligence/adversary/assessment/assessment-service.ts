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

import { db, directDb } from "@/shared/db";
import {
  adversaryAssessments,
  adversaryVulnerabilities,
} from "@/shared/db/schemas/adversary";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { runRealAssessment } from "./assessment-runner";
import { analyzeAssessment } from "./ai-analyst";

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

    const run = await runRealAssessment({ target: assessment.target });
    if (!run.success || !run.evidence) {
      throw new Error(run.error ?? "El motor de evaluación no devolvió evidencia");
    }

    await directDb
      .update(adversaryAssessments)
      .set({
        status: "analyzing",
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

      // Réplica en findings unificados del dashboard
      await db.insert(intelligenceFindings).values({
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
    await directDb
      .update(adversaryAssessments)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adversaryAssessments.id, assessmentId));
  }
}
