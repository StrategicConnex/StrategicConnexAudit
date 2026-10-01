'use server';

import { authenticatedAction, type DbTransaction } from "@/shared/lib/actions";
import { requireProjectPermission, getProjectRole } from "@/server/lib/project-access";
import { z } from 'zod';
import {
  keywordTargets, rankHistory, competitors, projects, integrationDataGsc,
} from '@/shared/db/schemas';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { normalizeDomain } from '@/shared/utils/domain';

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

    const latestByKeyword = new Map<string, { position: number | null; searchVolume: number | null }>();
    if (targets.length > 0) {
      const historyRows = await tx.query.rankHistory.findMany({
        where: inArray(rankHistory.keywordId, targets.map((t) => t.id)),
        orderBy: [desc(rankHistory.checkedAt)],
      });
      for (const hr of historyRows) {
        if (!latestByKeyword.has(hr.keywordId)) {
          latestByKeyword.set(hr.keywordId, {
            position: hr.position ?? null,
            searchVolume: hr.searchVolume ?? null,
          });
        }
      }
    }

    const rows: KeywordRow[] = targets.map((target) => {
      const latest = latestByKeyword.get(target.id);
      return {
        id: target.id,
        keyword: target.keyword,
        projectName: project?.name ?? "",
        volume: latest?.searchVolume ?? null,
        difficulty: null, // Sin proveedor SERP: no inventar KD
        position: latest?.position ?? null,
      };
    });

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
      myRole: await getProjectRole(user.id, projectId),
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
    // A-3: scan:execute (editor+) en vez de solo owner.
    const denied = await requireProjectPermission(user.id, projectId, "scan:execute");
    if (denied) return { error: denied };
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
    if (!target) {
      return { error: "Keyword no encontrada" };
    }
    const denied = await requireProjectPermission(user.id, target.projectId, "scan:execute");
    if (denied) return { error: denied };
    await tx.delete(keywordTargets).where(eq(keywordTargets.id, id));
    revalidatePath('/');
    return { success: true as const };
  }
);

const ImportCsvSchema = z.object({
  projectId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        keyword: z.string().trim().min(1).max(120),
        position: z.number().int().min(1).max(1000).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .min(1)
    .max(500),
});

/**
 * B-2: importa posiciones desde CSV (formato: keyword,position,date?).
 * Camino honesto hasta OAuth de GSC: el usuario exporta de Search Console
 * y lo sube aquí. Crea targets y registra el rank del día.
 */
export const importKeywordCsv = authenticatedAction(
  ImportCsvSchema,
  async ({ projectId, rows }, { user, tx }) => {
    const denied = await requireProjectPermission(user.id, projectId, "scan:execute");
    if (denied) return { error: denied };

    const today = new Date().toISOString().slice(0, 10);
    const normalizedRows = rows.map((row) => ({
      keyword: row.keyword.toLowerCase(),
      position: row.position,
      date: row.date,
    }));
    const uniqueKeywords = [...new Set(normalizedRows.map((r) => r.keyword))];

    const inserted = await tx
      .insert(keywordTargets)
      .values(uniqueKeywords.map((keyword) => ({ projectId, keyword })))
      .onConflictDoNothing()
      .returning({ id: keywordTargets.id, keyword: keywordTargets.keyword });

    const idByKeyword = new Map<string, string>(
      inserted.map((r) => [r.keyword, r.id] as [string, string])
    );
    const missing = uniqueKeywords.filter((k) => !idByKeyword.has(k));
    if (missing.length > 0) {
      const existing = await tx.query.keywordTargets.findMany({
        where: and(eq(keywordTargets.projectId, projectId), inArray(keywordTargets.keyword, missing)),
      });
      for (const e of existing) idByKeyword.set(e.keyword, e.id);
    }

    let targets = 0;
    const rankByCell = new Map<string, { keywordId: string; position: number; checkedAt: string }>();
    for (const row of normalizedRows) {
      const targetId = idByKeyword.get(row.keyword);
      if (!targetId) continue;
      targets++;
      if (row.position !== undefined) {
        rankByCell.set(`${targetId}|${row.date ?? today}`, {
          keywordId: targetId,
          position: row.position,
          checkedAt: row.date ?? today,
        });
      }
    }

    const rankRows = [...rankByCell.values()];
    if (rankRows.length > 0) {
      await tx
        .insert(rankHistory)
        .values(rankRows)
        .onConflictDoUpdate({
          target: [rankHistory.keywordId, rankHistory.checkedAt],
          set: { position: sql`excluded.position` },
        });
    }

    revalidatePath('/');
    return { success: true as const, targets, imported: rankRows.length };
  }
);

const AddCompetitorSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().trim().min(3).max(253),
});

export const addCompetitor = authenticatedAction(
  AddCompetitorSchema,
  async ({ projectId, domain }, { user, tx }) => {
    const denied = await requireProjectPermission(user.id, projectId, "scan:execute");
    if (denied) return { error: denied };
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
    if (!comp) {
      return { error: "Competidor no encontrado" };
    }
    const denied = await requireProjectPermission(user.id, comp.projectId, "scan:execute");
    if (denied) return { error: denied };
    await tx.delete(competitors).where(eq(competitors.id, id));
    revalidatePath('/');
    return { success: true as const };
  }
);
