import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import {
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceToolRuns,
} from "@/shared/db/schemas";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError } from "@/server/lib/app-error";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

const COMPARE_FINDINGS_LIMIT = 1000;
const COMPARE_TOOLRUNS_LIMIT = 1000;

interface FindingDiff {
  title: string;
  severity: string;
  status: "new" | "resolved" | "unchanged";
  affectedAsset?: string | null;
}

interface CompareResult {
  investigationA: {
    id: string;
    title: string;
    target: string;
    score: number | null;
    completedAt: string | null;
    findingsCount: number;
  };
  investigationB: {
    id: string;
    title: string;
    target: string;
    score: number | null;
    completedAt: string | null;
    findingsCount: number;
  };
  scoreDelta: number | null;
  findingsDiff: {
    totalA: number;
    totalB: number;
    truncated: boolean;
    newInB: FindingDiff[];
    resolvedSinceA: FindingDiff[];
    unchanged: FindingDiff[];
  };
  toolsDiff: {
    toolsUsedA: string[];
    toolsUsedB: string[];
    newTools: string[];
    removedTools: string[];
  };
}

/**
 * GET /api/intelligence/compare?investigationA=xxx&investigationB=yyy
 *
 * Compares two investigations for the same target, showing:
 * - Score delta
 * - New findings in B not in A
 * - Resolved findings (in A but not in B)
 * - Unchanged findings
 * - Tool usage differences
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const { searchParams } = new URL(req.url);
  const investigationAId = searchParams.get("investigationA");
  const investigationBId = searchParams.get("investigationB");

  if (!investigationAId || !investigationBId) {
    throw new ValidationError("Se requieren investigationA e investigationB");
  }

  if (investigationAId === investigationBId) {
    throw new ValidationError("Las investigaciones deben ser diferentes");
  }

  const result = await withRLS(user.id, async (tx) => {
    // Fetch both investigations
    const [invA, invB] = await Promise.all([
      tx.query.intelligenceInvestigations.findFirst({
        where: eq(intelligenceInvestigations.id, investigationAId),
      }),
      tx.query.intelligenceInvestigations.findFirst({
        where: eq(intelligenceInvestigations.id, investigationBId),
      }),
    ]);

    if (!invA) throw new NotFoundError("Investigación", investigationAId);
    if (!invB) throw new NotFoundError("Investigación", investigationBId);

    const [countARows, countBRows] = await Promise.all([
      tx
        .select({ n: count() })
        .from(intelligenceFindings)
        .where(eq(intelligenceFindings.investigationId, investigationAId)),
      tx
        .select({ n: count() })
        .from(intelligenceFindings)
        .where(eq(intelligenceFindings.investigationId, investigationBId)),
    ]);
    const totalA = Number(countARows[0]?.n ?? 0);
    const totalB = Number(countBRows[0]?.n ?? 0);

    // Fetch findings for both
    const [findingsA, findingsB] = await Promise.all([
      tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationAId),
        columns: { title: true, severity: true, affectedAsset: true },
        orderBy: [asc(intelligenceFindings.severity), asc(intelligenceFindings.title)],
        limit: COMPARE_FINDINGS_LIMIT,
      }),
      tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationBId),
        columns: { title: true, severity: true, affectedAsset: true },
        orderBy: [asc(intelligenceFindings.severity), asc(intelligenceFindings.title)],
        limit: COMPARE_FINDINGS_LIMIT,
      }),
    ]);

    // Fetch tool runs for both
    const [toolsARows, toolsBRows] = await Promise.all([
      tx
        .select({ toolId: intelligenceToolRuns.toolId })
        .from(intelligenceToolRuns)
        .where(eq(intelligenceToolRuns.investigationId, investigationAId))
        .groupBy(intelligenceToolRuns.toolId)
        .limit(COMPARE_TOOLRUNS_LIMIT),
      tx
        .select({ toolId: intelligenceToolRuns.toolId })
        .from(intelligenceToolRuns)
        .where(eq(intelligenceToolRuns.investigationId, investigationBId))
        .groupBy(intelligenceToolRuns.toolId)
        .limit(COMPARE_TOOLRUNS_LIMIT),
    ]);

    // Build finding comparison using title as key
    const findingsMapA = new Map(findingsA.map((f) => [f.title, f]));
    const findingsMapB = new Map(findingsB.map((f) => [f.title, f]));

    const newInB: FindingDiff[] = [];
    const resolvedSinceA: FindingDiff[] = [];
    const unchanged: FindingDiff[] = [];

    for (const [title, fB] of findingsMapB) {
      const fA = findingsMapA.get(title);
      if (!fA) {
        newInB.push({ title, severity: fB.severity, status: "new", affectedAsset: fB.affectedAsset });
      } else {
        unchanged.push({ title, severity: fB.severity, status: "unchanged", affectedAsset: fB.affectedAsset });
      }
    }

    for (const [title, fA] of findingsMapA) {
      if (!findingsMapB.has(title)) {
        resolvedSinceA.push({ title, severity: fA.severity, status: "resolved", affectedAsset: fA.affectedAsset });
      }
    }

    // Tool comparison
    const toolSetA = new Set(toolsARows.map((t) => t.toolId));
    const toolSetB = new Set(toolsBRows.map((t) => t.toolId));
    const newTools = [...toolSetB].filter((t) => !toolSetA.has(t));
    const removedTools = [...toolSetA].filter((t) => !toolSetB.has(t));

    const response: CompareResult = {
      investigationA: {
        id: invA.id,
        title: invA.title,
        target: invA.target,
        score: invA.score,
        completedAt: invA.completedAt?.toISOString() ?? null,
        findingsCount: totalA,
      },
      investigationB: {
        id: invB.id,
        title: invB.title,
        target: invB.target,
        score: invB.score,
        completedAt: invB.completedAt?.toISOString() ?? null,
        findingsCount: totalB,
      },
      scoreDelta: invA.score !== null && invB.score !== null ? invB.score - invA.score : null,
      findingsDiff: {
        totalA,
        totalB,
        truncated: totalA > findingsA.length || totalB > findingsB.length,
        newInB,
        resolvedSinceA,
        unchanged,
      },
      toolsDiff: {
        toolsUsedA: [...toolSetA],
        toolsUsedB: [...toolSetB],
        newTools,
        removedTools,
      },
    };

    return response;
  });

  return NextResponse.json({ success: true, ...result });
});

export const GET = withRequestContext(rawGetHandler);
