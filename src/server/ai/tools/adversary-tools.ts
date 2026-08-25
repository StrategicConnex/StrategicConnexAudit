/**
 * adversary-tools.ts — Tools read-only para el agente analista de evaluaciones.
 *
 * Cada factory recibe el userId autenticado y los handlers verifican
 * ownership contra projects ANTES de leer nada: aunque el modelo invente un
 * projectId/assessmentId ajeno, la query no devuelve datos fuera de su alcance.
 */

import { z } from "zod";
import { directDb } from "@/shared/db";
import {
  adversaryAssessments,
  adversaryVulnerabilities,
  projects,
} from "@/shared/db/schemas";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { and, desc, eq } from "drizzle-orm";
import type { ToolDefinition } from "./registry";

/** Verifica que el assessment pertenece a un proyecto del usuario. */
async function assertOwnedAssessment(userId: string, assessmentId: string) {
  const [row] = await directDb
    .select({ id: adversaryAssessments.id })
    .from(adversaryAssessments)
    .innerJoin(projects, eq(projects.id, adversaryAssessments.projectId))
    .where(and(eq(adversaryAssessments.id, assessmentId), eq(projects.ownerId, userId)))
    .limit(1);
  return !!row;
}

export function buildAdversaryTools(userId: string): Array<ToolDefinition<z.ZodTypeAny>> {
  return [
    {
      name: "get_assessment_evidence",
      description:
        "Evidencia cruda de una evaluación real: checks ejecutados con sus datos técnicos (headers capturados, puertos abiertos, archivos expuestos, payloads y respuestas). Úsala para profundizar antes de clasificar.",
      parameters: z.object({
        assessmentId: z.string().uuid(),
        checkId: z.string().max(64).optional().describe("Filtra a un solo check (ej: tls-certificate)"),
      }),
      timeoutMs: 8_000,
      handler: async ({ assessmentId, checkId }) => {
        if (!(await assertOwnedAssessment(userId, assessmentId))) {
          return { error: "Evaluación no encontrada o sin acceso" };
        }
        const [row] = await directDb
          .select({ rawEvidence: adversaryAssessments.rawEvidence })
          .from(adversaryAssessments)
          .where(eq(adversaryAssessments.id, assessmentId))
          .limit(1);
        const evidence = row?.rawEvidence as { checks?: Array<{ id: string; [k: string]: unknown }> } | null;
        const checks = evidence?.checks ?? [];
        return checkId ? { checks: checks.filter((c) => c.id === checkId) } : { checks };
      },
    },
    {
      name: "get_assessment_summary",
      description:
        "Estado agregado de una evaluación: target, checks pasados/fallidos, vulnerabilidades ya confirmadas y resumen ejecutivo previo.",
      parameters: z.object({
        assessmentId: z.string().uuid(),
      }),
      timeoutMs: 8_000,
      handler: async ({ assessmentId }) => {
        if (!(await assertOwnedAssessment(userId, assessmentId))) {
          return { error: "Evaluación no encontrada o sin acceso" };
        }
        const [a] = await directDb
          .select({
            target: adversaryAssessments.target,
            status: adversaryAssessments.status,
            riskScore: adversaryAssessments.riskScore,
            summary: adversaryAssessments.summary,
            checksTotal: adversaryAssessments.checksTotal,
            checksPassed: adversaryAssessments.checksPassed,
          })
          .from(adversaryAssessments)
          .where(eq(adversaryAssessments.id, assessmentId))
          .limit(1);
        const vulns = await directDb
          .select({ title: adversaryVulnerabilities.title, severity: adversaryVulnerabilities.severity })
          .from(adversaryVulnerabilities)
          .where(eq(adversaryVulnerabilities.assessmentId, assessmentId));
        return { ...a, confirmedVulnerabilities: vulns };
      },
    },
    {
      name: "list_project_findings",
      description:
        "Hallazgos históricos del proyecto (todas las fuentes). Útil para correlacionar la evidencia actual con hallazgos previos y ajustar confianza.",
      parameters: z.object({
        projectId: z.string().uuid(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      timeoutMs: 8_000,
      handler: async ({ projectId, severity, limit }) => {
        const [owned] = await directDb
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
          .limit(1);
        if (!owned) return { error: "Proyecto no encontrado o sin acceso" };

        const conditions = [eq(intelligenceFindings.projectId, projectId)];
        if (severity) conditions.push(eq(intelligenceFindings.severity, severity));

        const rows = await directDb
          .select({
            title: intelligenceFindings.title,
            severity: intelligenceFindings.severity,
            recommendation: intelligenceFindings.recommendation,
            createdAt: intelligenceFindings.createdAt,
          })
          .from(intelligenceFindings)
          .where(and(...conditions))
          .orderBy(desc(intelligenceFindings.createdAt))
          .limit(limit);
        return { findings: rows };
      },
    },
  ] as Array<ToolDefinition<z.ZodTypeAny>>;
}
