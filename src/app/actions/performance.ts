'use server';

import { z } from 'zod';
import { authenticatedAction } from '@/shared/lib/actions';
import { projects, audits, issues, webVitalsLogs } from '@/shared/db/schemas';
import { and, eq, isNull, inArray, gte, desc, count } from 'drizzle-orm';
import { healthScoreFor } from '@/components/issue-impact';

export type VitalStatus = 'good' | 'needs_improvement' | 'poor';

export interface PerformanceSnapshot {
  updatedAt: string;
  windowMinutes: number;
  vitals: {
    lcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    lcpStatus: VitalStatus | null;
    clsStatus: VitalStatus | null;
    inpStatus: VitalStatus | null;
    sparkline: Array<{ v: number | null }>;
    sampleCount: number;
  };
  overallScore: number | null;
  assessedProjects: number;
  healthSegments: { critical: number; warning: number; good: number };
  projects: Array<{ id: string; score: number | null }>;
}

const WINDOW_MINUTES = 30;
const SPARKLINE_BUCKETS = 9;
const MAX_VITALS_ROWS = 2000;
const MAX_AUDITS_ROWS = 1000;

/** Umbrales Web Vitals: good ≤ good, poor > poor (intermedio = needs_improvement). */
const THRESHOLDS = {
  lcp: { goodMs: 2500, poorMs: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { goodMs: 200, poorMs: 500 },
} as const;

const EmptySchema = z.object({}).describe('performance-snapshot');

function statusOf(value: number, good: number, poor: number): VitalStatus {
  if (value <= good) return 'good';
  if (value <= poor) return 'needs_improvement';
  return 'poor';
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function emptySnapshot(): PerformanceSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    windowMinutes: WINDOW_MINUTES,
    vitals: {
      lcpMs: null,
      cls: null,
      inpMs: null,
      lcpStatus: null,
      clsStatus: null,
      inpStatus: null,
      sparkline: Array.from({ length: SPARKLINE_BUCKETS }, () => ({ v: null })),
      sampleCount: 0,
    },
    overallScore: null,
    assessedProjects: 0,
    healthSegments: { critical: 0, warning: 0, good: 0 },
    projects: [],
  };
}

export const getPerformanceSnapshot = authenticatedAction(
  EmptySchema,
  async (_input, { user, tx }): Promise<PerformanceSnapshot> => {
    // 1. Proyectos activos del usuario (mismo filtro que page.tsx/looker).
    const projectRows = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.ownerId, user.id),
          isNull(projects.deletedAt),
          eq(projects.isDeleted, false),
        ),
      );
    const projectIds = projectRows.map((p) => p.id);
    if (projectIds.length === 0) return emptySnapshot();

    const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60_000);

    // 2. Web Vitals de la ventana (1 query; índice idx_web_vitals_project_recorded).
    const vitalsRows = await tx
      .select({
        lcp: webVitalsLogs.lcp,
        cls: webVitalsLogs.cls,
        inp: webVitalsLogs.inp,
        recordedAt: webVitalsLogs.recordedAt,
      })
      .from(webVitalsLogs)
      .where(
        and(
          inArray(webVitalsLogs.projectId, projectIds),
          gte(webVitalsLogs.recordedAt, cutoff),
        ),
      )
      .orderBy(webVitalsLogs.recordedAt)
      .limit(MAX_VITALS_ROWS);

    // 3. Auditorías (1 query); última completed por proyecto en memoria.
    const auditRows = await tx
      .select({
        id: audits.id,
        projectId: audits.projectId,
        status: audits.status,
        createdAt: audits.createdAt,
      })
      .from(audits)
      .where(inArray(audits.projectId, projectIds))
      .orderBy(desc(audits.createdAt))
      .limit(MAX_AUDITS_ROWS);

    const latestByProject = new Map<string, string>();
    for (const row of auditRows) {
      if (row.status === 'completed' && !latestByProject.has(row.projectId)) {
        latestByProject.set(row.projectId, row.id);
      }
    }

    // 4. Issues de esas auditorías (1 query con GROUP BY — sin N+1).
    const latestIds = [...latestByProject.values()];
    const issueRows: Array<{ auditId: string | null; severity: string; n: number }> =
      latestIds.length === 0
        ? []
        : await tx
            .select({
              auditId: issues.auditId,
              severity: issues.severity,
              n: count(),
            })
            .from(issues)
            .where(inArray(issues.auditId, latestIds))
            .groupBy(issues.auditId, issues.severity);

    const critByAudit = new Map<string, number>();
    const warnByAudit = new Map<string, number>();
    for (const row of issueRows) {
      if (!row.auditId) continue;
      const n = Number(row.n) || 0;
      if (row.severity === 'critical') critByAudit.set(row.auditId, (critByAudit.get(row.auditId) ?? 0) + n);
      if (row.severity === 'warning') warnByAudit.set(row.auditId, (warnByAudit.get(row.auditId) ?? 0) + n);
    }

    // Score por proyecto con la fórmula del producto (15/crítico, 5/aviso).
    const projectScores: Array<{ id: string; score: number | null }> = projectIds.map((id) => {
      const auditId = latestByProject.get(id);
      if (!auditId) return { id, score: null };
      const score = healthScoreFor(critByAudit.get(auditId) ?? 0, warnByAudit.get(auditId) ?? 0);
      return { id, score };
    });

    const assessed = projectScores.filter((p) => p.score !== null) as Array<{ id: string; score: number }>;
    const healthSegments = { critical: 0, warning: 0, good: 0 };
    for (const { score } of assessed) {
      if (score < 60) healthSegments.critical += 1;
      else if (score < 85) healthSegments.warning += 1;
      else healthSegments.good += 1;
    }
    const overall = avg(assessed.map((p) => p.score));

    // Vitals: promedios de la ventana + sparkline de INP en 9 buckets.
    const lcpValues: number[] = [];
    const clsValues: number[] = [];
    const inpValues: number[] = [];
    const bucketSum = Array.from({ length: SPARKLINE_BUCKETS }, () => 0);
    const bucketCount = Array.from({ length: SPARKLINE_BUCKETS }, () => 0);
    const bucketMs = (WINDOW_MINUTES * 60_000) / SPARKLINE_BUCKETS;

    for (const row of vitalsRows) {
      const recordedMs = row.recordedAt instanceof Date ? row.recordedAt.getTime() : new Date(row.recordedAt).getTime();
      if (row.lcp != null) lcpValues.push(Number(row.lcp));
      if (row.cls != null) clsValues.push(Number(row.cls));
      if (row.inp != null) {
        const value = Number(row.inp);
        inpValues.push(value);
        const offset = Math.max(0, recordedMs - cutoff.getTime());
        const bucket = Math.min(SPARKLINE_BUCKETS - 1, Math.floor(offset / bucketMs));
        bucketSum[bucket] = (bucketSum[bucket] ?? 0) + value;
        bucketCount[bucket] = (bucketCount[bucket] ?? 0) + 1;
      }
    }

    const lcpMs = avg(lcpValues);
    const cls = avg(clsValues);
    const inpMs = avg(inpValues);

    return {
      updatedAt: new Date().toISOString(),
      windowMinutes: WINDOW_MINUTES,
      vitals: {
        lcpMs,
        cls,
        inpMs,
        lcpStatus: lcpMs != null ? statusOf(lcpMs, THRESHOLDS.lcp.goodMs, THRESHOLDS.lcp.poorMs) : null,
        clsStatus: cls != null ? statusOf(cls, THRESHOLDS.cls.good, THRESHOLDS.cls.poor) : null,
        inpStatus: inpMs != null ? statusOf(inpMs, THRESHOLDS.inp.goodMs, THRESHOLDS.inp.poorMs) : null,
        sparkline: bucketSum.map((sum, i) => {
          const n = bucketCount[i] ?? 0;
          return { v: n > 0 ? Math.round((sum / n) * 100) / 100 : null };
        }),
        sampleCount: vitalsRows.length,
      },
      overallScore: overall != null ? Math.round(overall * 10) / 10 : null,
      assessedProjects: assessed.length,
      healthSegments,
      projects: projectScores,
    };
  },
);
