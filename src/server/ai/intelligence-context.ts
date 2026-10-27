import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { withRLS } from "@/shared/db/rls";
import { intelligenceFindings, intelligenceInvestigations, projects } from "@/shared/db/schemas";

export interface IntelligenceContextIds {
  projectId?: string;
  investigationId?: string;
}

const RECENT_FINDINGS_DAYS = 7;
const MAX_RECENT_FINDINGS = 25;

/**
 * Resolve client-provided resource IDs under the authenticated user's RLS scope.
 * A null result intentionally conflates missing and inaccessible resources.
 */
export async function loadIntelligenceCopilotContext(
  userId: string,
  ids: IntelligenceContextIds,
): Promise<Record<string, unknown> | null> {
  const projectId = ids.projectId;
  const investigationId = ids.investigationId;
  if (!projectId) {
    if (investigationId) return null;
    return {
      projects: [],
      summary: { totalProjects: 0 },
      investigation: null,
      findings: [],
    };
  }

  return withRLS(userId, async (tx) => {
    const project = await tx.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false),
      ),
      columns: { id: true, name: true, domain: true },
    });

    if (!project) return null;

    let investigation: {
      id: string;
      target: string;
      targetType: string;
      status: string;
      score: number | null;
      summary: string | null;
    } | null = null;

    if (investigationId) {
      investigation = (await tx.query.intelligenceInvestigations.findFirst({
        where: and(
          eq(intelligenceInvestigations.id, investigationId),
          eq(intelligenceInvestigations.projectId, projectId),
        ),
        columns: {
          id: true,
          target: true,
          targetType: true,
          status: true,
          score: true,
          summary: true,
        },
      })) ?? null;

      if (!investigation) return null;
    }

    const since = new Date(Date.now() - RECENT_FINDINGS_DAYS * 24 * 60 * 60 * 1000);
    const findingConditions = [
      eq(intelligenceFindings.projectId, projectId),
      gte(intelligenceFindings.createdAt, since),
      ...(investigationId
        ? [eq(intelligenceFindings.investigationId, investigationId)]
        : []),
    ];
    const findings = await tx.query.intelligenceFindings.findMany({
      where: and(...findingConditions),
      orderBy: [desc(intelligenceFindings.createdAt)],
      limit: MAX_RECENT_FINDINGS,
      columns: {
        id: true,
        investigationId: true,
        severity: true,
        title: true,
        description: true,
        recommendation: true,
        evidence: true,
        affectedAsset: true,
        createdAt: true,
      },
    });

    return { project, investigation, findings };
  });
}
