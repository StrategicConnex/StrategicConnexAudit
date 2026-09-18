import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import {
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceToolRuns,
} from "@/shared/db/schemas";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError, NotFoundError } from "@/server/lib/app-error";

export const dynamic = "force-dynamic";

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
export const GET = withErrorHandler(async (req: NextRequest) => {
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

    // Fetch findings for both
    const [findingsA, findingsB] = await Promise.all([
      tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationAId),
      }),
      tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.investigationId, investigationBId),
      }),
    ]);

    // Fetch tool runs for both
    const [toolsA, toolsB] = await Promise.all([
      tx.query.intelligenceToolRuns.findMany({
        where: eq(intelligenceToolRuns.investigationId, investigationAId),
        columns: { toolId: true },
      }),
      tx.query.intelligenceToolRuns.findMany({
        where: eq(intelligenceToolRuns.investigationId, investigationBId),
        columns: { toolId: true },
      }),
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
    const toolSetA = new Set(toolsA.map((t) => t.toolId));
    const toolSetB = new Set(toolsB.map((t) => t.toolId));
    const newTools = [...toolSetB].filter((t) => !toolSetA.has(t));
    const removedTools = [...toolSetA].filter((t) => !toolSetB.has(t));

    const response: CompareResult = {
      investigationA: {
        id: invA.id,
        title: invA.title,
        target: invA.target,
        score: invA.score,
        completedAt: invA.completedAt?.toISOString() ?? null,
        findingsCount: findingsA.length,
      },
      investigationB: {
        id: invB.id,
        title: invB.title,
        target: invB.target,
        score: invB.score,
        completedAt: invB.completedAt?.toISOString() ?? null,
        findingsCount: findingsB.length,
      },
      scoreDelta: invA.score !== null && invB.score !== null ? invB.score - invA.score : null,
      findingsDiff: {
        totalA: findingsA.length,
        totalB: findingsB.length,
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
