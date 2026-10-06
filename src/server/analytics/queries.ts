/**
 * queries.ts — Carga de datos del portafolio, tendencias y purple score.
 *
 * Toda la aritmética vive en los módulos puros hermanos (portfolio.ts,
 * trends.ts, purple-score.ts); aquí solo se traduce SQL → filas planas. Las
 * lecturas van por `withRLS`, igual que el resto del producto: el filtro de
 * multi-tenancy lo impone Postgres, no el WHERE de la aplicación.
 */

import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { withRLS } from "@/shared/db/rls";
import {
  adversaryRuns,
  adversaryScenarios,
  audits,
  intelligenceFindings,
  issues,
  mitreEvaluations,
  mitreTechniqueResults,
  projectMembers,
  projects,
  uptimeLogs,
} from "@/shared/db/schemas";
import {
  buildPortfolio,
  type ProjectRollupRow,
  type PortfolioReport,
} from "./portfolio";
import {
  buildTrends,
  type ScorePointRow,
  type TrendBucket,
  type TrendsReport,
} from "./trends";
import {
  computePurpleScore,
  computePurpleTrend,
  type AdversaryOutcome,
  type AdversaryRunRow,
  type MitreVerdict,
  type PurpleScoreTrend,
} from "./purple-score";

const MITRE_VERDICTS: readonly string[] = [
  "exposed",
  "not_exposed",
  "not_externally_testable",
  "error",
];

const ADVERSARY_OUTCOMES: readonly string[] = ["detected", "missed", "error"];

/**
 * `mitre_technique_results.verdict` y `adversary_runs.result` son TEXT, no
 * enums de Postgres: la base puede devolver cualquier cadena. Un `as const`
 * forzaría el tipo y un valor inesperado se contaría como "expuesto" o
 * "detectado". Aquí se descarta lo que no está en el conjunto conocido, y el
 * módulo puro lo trata como evidencia ausente.
 */
function toVerdict(value: string): MitreVerdict | null {
  return (MITRE_VERDICTS as readonly string[]).includes(value) ? (value as MitreVerdict) : null;
}

function toOutcome(value: string | null): AdversaryOutcome | null {
  if (value === null) return null;
  return (ADVERSARY_OUTCOMES as readonly string[]).includes(value)
    ? (value as AdversaryOutcome)
    : null;
}

/**
 * Proyectos visibles para el usuario: suyos o de un equipo del que es miembro.
 * Se replica aquí (y no solo vía RLS) porque las agregaciones posteriores
 * necesitan el conjunto de ids en una sola pasada, sin N+1.
 */
async function visibleProjectIds(
  tx: Parameters<Parameters<typeof withRLS>[1]>[0],
  userId: string
): Promise<string[]> {
  const owned = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, userId),
        sql`${projects.deletedAt} is null`,
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false)
      )
    );

  const membership = await tx
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  const ids = new Set<string>();
  for (const p of owned) ids.add(p.id);
  for (const m of membership) ids.add(m.id);
  return Array.from(ids);
}

type Tx = Parameters<Parameters<typeof withRLS>[1]>[0];

async function loadProjectRows(tx: Tx, userId: string): Promise<ProjectRollupRow[]> {
  const ids = await visibleProjectIds(tx, userId);
  if (ids.length === 0) return [];

  const projectRows = await tx
    .select({ id: projects.id, name: projects.name, domain: projects.domain })
    .from(projects)
    .where(inArray(projects.id, ids))
    .orderBy(desc(projects.createdAt));

  // Última auditoría COMPLETADA por proyecto: el score se calcula sobre ella,
  // igual que en /projects/[id]. Una auditoría en curso no tiene issues aún.
  const completedAudits = await tx
    .select({ id: audits.id, projectId: audits.projectId, completedAt: audits.completedAt })
    .from(audits)
    .where(and(inArray(audits.projectId, ids), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));

  const latestByProject = new Map<string, { id: string; completedAt: Date | null }>();
  for (const audit of completedAudits) {
    if (!latestByProject.has(audit.projectId)) {
      latestByProject.set(audit.projectId, { id: audit.id, completedAt: audit.completedAt });
    }
  }

  const latestAuditIds = Array.from(latestByProject.values()).map((a) => a.id);
  const issueStats = new Map<string, { critical: number; warnings: number }>();
  if (latestAuditIds.length > 0) {
    const stats = await tx
      .select({
        auditId: issues.auditId,
        critical: sql<number>`count(*) filter (where ${issues.severity} = 'critical')::int`,
        warnings: sql<number>`count(*) filter (where ${issues.severity} = 'warning')::int`,
      })
      .from(issues)
      .where(inArray(issues.auditId, latestAuditIds))
      .groupBy(issues.auditId);
    for (const s of stats) {
      if (s.auditId) issueStats.set(s.auditId, { critical: s.critical, warnings: s.warnings });
    }
  }

  // Hallazgos: conteo por severidad y duraciones de resolución, en dos
  // consultas agrupadas en vez de una por proyecto.
  const openRows = await tx
    .select({
      projectId: intelligenceFindings.projectId,
      severity: intelligenceFindings.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(intelligenceFindings)
    .where(
      and(
        inArray(intelligenceFindings.projectId, ids),
        sql`${intelligenceFindings.status} not in ('resolved', 'false_positive', 'accepted_risk')`,
        sql`(${intelligenceFindings.suppressedUntil} is null or ${intelligenceFindings.suppressedUntil} < now())`
      )
    )
    .groupBy(intelligenceFindings.projectId, intelligenceFindings.severity);

  const openByProject = new Map<string, Record<string, number>>();
  for (const row of openRows) {
    const bucket = openByProject.get(row.projectId) ?? {};
    bucket[row.severity] = row.count;
    openByProject.set(row.projectId, bucket);
  }

  const resolvedRows = await tx
    .select({
      projectId: intelligenceFindings.projectId,
      createdAt: intelligenceFindings.createdAt,
      resolvedAt: intelligenceFindings.resolvedAt,
    })
    .from(intelligenceFindings)
    .where(
      and(
        inArray(intelligenceFindings.projectId, ids),
        eq(intelligenceFindings.status, "resolved"),
        isNotNull(intelligenceFindings.resolvedAt)
      )
    );

  const durationsByProject = new Map<
    string,
    Array<{ createdAt: Date; resolvedAt: Date }>
  >();
  const closedByProject = new Map<string, number>();
  for (const row of resolvedRows) {
    // `created_at` es nullable en el esquema: sin él no hay duración medible.
    if (row.resolvedAt === null || row.createdAt === null) continue;
    const list = durationsByProject.get(row.projectId) ?? [];
    list.push({ createdAt: row.createdAt, resolvedAt: row.resolvedAt });
    durationsByProject.set(row.projectId, list);
    closedByProject.set(row.projectId, (closedByProject.get(row.projectId) ?? 0) + 1);
  }

  return projectRows.map((p) => {
    const latest = latestByProject.get(p.id);
    const stats = latest ? issueStats.get(latest.id) : undefined;
    return {
      id: p.id,
      name: p.name,
      domain: p.domain,
      latestAuditAt: latest?.completedAt ?? null,
      criticalIssues: stats?.critical ?? 0,
      warningIssues: stats?.warnings ?? 0,
      openBySeverity: openByProject.get(p.id) ?? {},
      closedFindings: closedByProject.get(p.id) ?? 0,
      resolvedDurationsHours: durationsByProject.get(p.id) ?? [],
    };
  });
}

export async function loadPortfolio(userId: string): Promise<PortfolioReport> {
  return withRLS(userId, async (tx) => buildPortfolio(await loadProjectRows(tx, userId)));
}

/**
 * Ventana de tendencias: `bucket` × `window` buckets hacia atrás desde ahora.
 * `window` acota el trabajo porque `audits`, `intelligence_findings` y
 * `uptime_logs` crecen sin límite; sin corte, un proyecto con un año de
 * histórico paga el escaneo entero para pintar la misma línea.
 */
export async function loadTrends(
  userId: string,
  bucket: TrendBucket,
  window: number
): Promise<TrendsReport> {
  const since = new Date(Date.now() - windowRangeMs(bucket, window));

  return withRLS(userId, async (tx) => {
    const ids = await visibleProjectIds(tx, userId);
    if (ids.length === 0) {
      return buildTrends({ audits: [], resolvedFindings: [], stillOpen: 0, uptimeSamples: [], bucket });
    }

    // El corte por fecha va en el SQL: filtrar en memoria obligaría a traer
    // el histórico completo del proyecto para pintar 12 semanas.
    const completedAudits = await tx
      .select({ id: audits.id, projectId: audits.projectId, completedAt: audits.completedAt })
      .from(audits)
      .where(
        and(
          inArray(audits.projectId, ids),
          eq(audits.status, "completed"),
          isNotNull(audits.completedAt),
          gte(audits.completedAt, since)
        )
      )
      .orderBy(desc(audits.completedAt));

    const auditIds = completedAudits.map((a) => a.id);
    const statsByAudit = new Map<string, { critical: number; warnings: number }>();
    if (auditIds.length > 0) {
      const stats = await tx
        .select({
          auditId: issues.auditId,
          critical: sql<number>`count(*) filter (where ${issues.severity} = 'critical')::int`,
          warnings: sql<number>`count(*) filter (where ${issues.severity} = 'warning')::int`,
        })
        .from(issues)
        .where(inArray(issues.auditId, auditIds))
        .groupBy(issues.auditId);
      for (const s of stats) {
        if (s.auditId) statsByAudit.set(s.auditId, { critical: s.critical, warnings: s.warnings });
      }
    }

    const auditRows: ScorePointRow[] = [];
    for (const a of completedAudits) {
      // Narrowing defensivo: `isNotNull` ya filtró, pero el tipo del driver
      // sigue siendo `Date | null` y una auditoría sin fecha no tiene punto.
      if (a.completedAt === null) continue;
      const stats = statsByAudit.get(a.id);
      auditRows.push({
        auditId: a.id,
        projectId: a.projectId,
        completedAt: a.completedAt,
        criticalIssues: stats?.critical ?? 0,
        warningIssues: stats?.warnings ?? 0,
      });
    }

    const resolved = await tx
      .select({
        createdAt: intelligenceFindings.createdAt,
        resolvedAt: intelligenceFindings.resolvedAt,
      })
      .from(intelligenceFindings)
      .where(
        and(
          inArray(intelligenceFindings.projectId, ids),
          eq(intelligenceFindings.status, "resolved"),
          isNotNull(intelligenceFindings.resolvedAt),
          gte(intelligenceFindings.resolvedAt, since)
        )
      );

    const stillOpenRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(intelligenceFindings)
      .where(
        and(
          inArray(intelligenceFindings.projectId, ids),
          sql`${intelligenceFindings.status} not in ('resolved', 'false_positive', 'accepted_risk')`
        )
      );

    const uptime = await tx
      .select({ isUp: uptimeLogs.isUp, checkedAt: uptimeLogs.checkedAt })
      .from(uptimeLogs)
      .where(and(inArray(uptimeLogs.projectId, ids), gte(uptimeLogs.checkedAt, since)));

    return buildTrends({
      audits: auditRows,
      resolvedFindings: resolved
        .filter((r): r is { createdAt: Date; resolvedAt: Date } => r.resolvedAt !== null)
        .map((r) => ({ createdAt: r.createdAt, resolvedAt: r.resolvedAt })),
      stillOpen: stillOpenRows[0]?.count ?? 0,
      uptimeSamples: uptime.map((u) => ({ isUp: u.isUp, checkedAt: u.checkedAt })),
      bucket,
    });
  });
}

function windowRangeMs(bucket: TrendBucket, window: number): number {
  switch (bucket) {
    case "day":
      return 86_400_000 * window;
    case "week":
      return 604_800_000 * window;
    case "month":
      return 2_629_746_000 * window;
  }
}

/** Últimas evaluaciones MITRE con sus veredictos por técnica. */
export async function loadPurpleScore(
  userId: string,
  projectId: string,
  windowDays = 90
): Promise<PurpleScoreTrend> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const previousSince = new Date(Date.now() - windowDays * 2 * 86_400_000);

  const loadWindow = async (from: Date, to: Date) =>
    withRLS(userId, async (tx) => {
      const evaluations = await tx
        .select({ id: mitreEvaluations.id })
        .from(mitreEvaluations)
        .where(
          and(
            eq(mitreEvaluations.projectId, projectId),
            gte(mitreEvaluations.createdAt, from),
            lt(mitreEvaluations.createdAt, to)
          )
        );
      const ids = evaluations.map((e) => e.id);

      const techniqueResults =
        ids.length > 0
          ? await tx
              .select({
                mitreId: mitreTechniqueResults.mitreId,
                tactic: mitreTechniqueResults.tactic,
                techniqueName: mitreTechniqueResults.techniqueName,
                verdict: mitreTechniqueResults.verdict,
                confidence: mitreTechniqueResults.confidence,
              })
              .from(mitreTechniqueResults)
              .where(inArray(mitreTechniqueResults.evaluationId, ids))
          : [];

      const validTechniques = techniqueResults
        .map((r) => ({ ...r, verdict: toVerdict(r.verdict) }))
        .filter((r): r is typeof r & { verdict: MitreVerdict } => r.verdict !== null);

      // El run hereda la técnica del escenario del catálogo: sin este join
      // `mitreId` sería null y ninguna técnica podría cerrar un punto ciego.
      const runs: AdversaryRunRow[] = await tx
        .select({
          result: adversaryRuns.result,
          detectedBy: adversaryRuns.detectedBy,
          mitreId: adversaryScenarios.mitreId,
          tactic: adversaryScenarios.mitreTactic,
        })
        .from(adversaryRuns)
        .leftJoin(adversaryScenarios, eq(adversaryScenarios.id, adversaryRuns.scenarioId))
        .where(and(eq(adversaryRuns.projectId, projectId), gte(adversaryRuns.createdAt, from)))
        .then((rows) =>
          rows
            .map((r) => ({ ...r, result: toOutcome(r.result) }))
            .filter((r): r is typeof r & { result: AdversaryOutcome } => r.result !== null)
        );

      return { techniqueResults: validTechniques, runs };
    });

  const [current, previous] = await Promise.all([
    loadWindow(since, new Date(Date.now() + 86_400_000)),
    loadWindow(previousSince, since),
  ]);

  return computePurpleTrend(
    computePurpleScore(current.techniqueResults, current.runs),
    computePurpleScore(previous.techniqueResults, previous.runs)
  );
}