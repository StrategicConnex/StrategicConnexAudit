'use server';

import { authenticatedAction, type DbTransaction } from "@/shared/lib/actions";
import { z } from 'zod';
import {
  keywordTargets, rankHistory, competitors, projects, integrationDataGsc,
} from '@/shared/db/schemas';
import { eq, and, desc, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

const ProjectIdSchema = z.object({ projectId: z.string().uuid() });

async function assertOwner(
  tx: DbTransaction,
  userId: string,
  projectId: string
): Promise<boolean> {
  const project = await tx.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
  });
  return !!project;
}

export interface KeywordRow {
  id: string;
  keyword: string;
  projectName: string;
  volume: number | null;
  difficulty: number | null;
  position: number | null;
}

export interface GscTotals {
  impressions: number;
  clicks: number;
  ctr: number | null;
  position: number | null;
  hasData: boolean;
}

export interface CompetitorRow {
  id: string;
  domain: string;
  name: string | null;
}

/**
 * P1-2: dashboard real de keywords — targets + último rank + totales GSC +
 * competidores. Todo verificado por ownership; sin fixtures.
 */
export const listKeywordData = authenticatedAction(
  ProjectIdSchema,
  async ({ projectId }, { user, tx }) => {
    if (!(await assertOwner(tx, user.id, projectId))) {
      return { error: "Proyecto no encontrado" };
    }

    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    const targets = await tx.query.keywordTargets.findMany({
      where: eq(keywordTargets.projectId, projectId),
      orderBy: [desc(keywordTargets.createdAt)],
      limit: 100,
    });

    const rows: KeywordRow[] = [];
    for (const target of targets) {
      const latest = await tx.query.rankHistory.findFirst({
        where: eq(rankHistory.keywordId, target.id),
        orderBy: [desc(rankHistory.checkedAt)],
      });
      rows.push({
        id: target.id,
        keyword: target.keyword,
        projectName: project?.name ?? "",
        volume: latest?.searchVolume ?? null,
        difficulty: null, // Sin proveedor SERP: no inventar KD
        position: latest?.position ?? null,
      });
    }

    const [totals] = await tx
      .select({
        impressions: sql<number>`coalesce(sum(${integrationDataGsc.impressions}), 0)`,
        clicks: sql<number>`coalesce(sum(${integrationDataGsc.clicks}), 0)`,
        ctr: sql<number | null>`avg(${integrationDataGsc.ctr})`,
        position: sql<number | null>`avg(${integrationDataGsc.position})`,
      })
      .from(integrationDataGsc)
      .where(eq(integrationDataGsc.projectId, projectId));

    const comps = await tx.query.competitors.findMany({
      where: eq(competitors.projectId, projectId),
      orderBy: [desc(competitors.createdAt)],
      limit: 20,
    });

    return {
      success: true as const,
      keywords: rows,
      gsc: {
        impressions: Number(totals?.impressions ?? 0),
        clicks: Number(totals?.clicks ?? 0),
        ctr: totals?.ctr !== null && totals?.ctr !== undefined ? Number(totals.ctr) : null,
        position: totals?.position !== null && totals?.position !== undefined ? Number(totals.position) : null,
        hasData: Number(totals?.impressions ?? 0) > 0 || Number(totals?.clicks ?? 0) > 0,
      } satisfies GscTotals,
      competitors: comps.map((c) => ({
        id: c.id,
        domain: c.domain,
        name: c.name,
      })) satisfies CompetitorRow[],
    };
  }
);

const AddKeywordSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(120),
});

export const addKeywordTarget = authenticatedAction(
  AddKeywordSchema,
  async ({ projectId, keyword }, { user, tx }) => {
    if (!(await assertOwner(tx, user.id, projectId))) {
      return { error: "Proyecto no encontrado" };
    }
    const normalized = keyword.toLowerCase();
    await tx
      .insert(keywordTargets)
      .values({ projectId, keyword: normalized })
      .onConflictDoNothing();
    revalidatePath('/');
    return { success: true as const, keyword: normalized };
  }
);

const IdSchema = z.object({ id: z.string().uuid() });

export const removeKeywordTarget = authenticatedAction(
  IdSchema,
  async ({ id }, { user, tx }) => {
    const target = await tx.query.keywordTargets.findFirst({
      where: eq(keywordTargets.id, id),
    });
    if (!target || !(await assertOwner(tx, user.id, target.projectId))) {
      return { error: "Keyword no encontrada" };
    }
    await tx.delete(keywordTargets).where(eq(keywordTargets.id, id));
    revalidatePath('/');
    return { success: true as const };
  }
);

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!;
}

const AddCompetitorSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().trim().min(3).max(253),
});

export const addCompetitor = authenticatedAction(
  AddCompetitorSchema,
  async ({ projectId, domain }, { user, tx }) => {
    if (!(await assertOwner(tx, user.id, projectId))) {
      return { error: "Proyecto no encontrado" };
    }
    const clean = normalizeDomain(domain);
    await tx
      .insert(competitors)
      .values({ projectId, domain: clean })
      .onConflictDoNothing();
    revalidatePath('/');
    return { success: true as const, domain: clean };
  }
);

export const removeCompetitor = authenticatedAction(
  IdSchema,
  async ({ id }, { user, tx }) => {
    const comp = await tx.query.competitors.findFirst({
      where: eq(competitors.id, id),
    });
    if (!comp || !(await assertOwner(tx, user.id, comp.projectId))) {
      return { error: "Competidor no encontrado" };
    }
    await tx.delete(competitors).where(eq(competitors.id, id));
    revalidatePath('/');
    return { success: true as const };
  }
);
