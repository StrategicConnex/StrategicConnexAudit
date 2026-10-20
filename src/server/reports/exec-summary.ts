/**
 * exec-summary.ts — Núcleo único del Resumen Ejecutivo (spec
 * docs/superpowers/specs/2026-10-20-executive-summary-redesign-design.md).
 *
 * reduceExecSummary() es PURA (testeable sin BD); la capa IO vive en
 * collectExecSummary() (Task 2 del plan). Los renderers (HTML react, react-pdf,
 * prompts IA) solo dibujan este contrato — misma cifra garantizada en las
 * 3 camadas.
 */
export type ExecSummarySeverity = 'critical' | 'warning' | 'info';
export type ExecSummaryCategory = 'seo' | 'meta' | 'performance' | 'security' | 'accessibility' | 'link';
export type ExecSummaryEffort = 'S' | 'M' | 'L';
export type ExecSummaryImpact = 'alto' | 'medio' | 'bajo';
export type ExecSummaryVerdict = 'ok' | 'warn' | 'critical';

export interface ExecSummaryRow {
  id: string;
  severity: ExecSummarySeverity;
  category: ExecSummaryCategory;
  title: string;
  description: string;
  url: string | null;
  recommendation: string | null;
  fixed?: boolean;
}

export interface ExecSummaryInput {
  audit: { id: string; createdAt: Date | null; completedAt: Date | null };
  issues: ExecSummaryRow[];
  /** Última auditoría COMPLETADA previa a `audit` (null si no hay). */
  priorAudit: { id: string; completedAt: Date | null; score: number } | null;
  /** Issues de esa auditoría previa (para contar NUEVOS por url+title+category). */
  priorIssues: ExecSummaryRow[];
  /** Issues del proyecto con fixed=true (cuentan como RESUELTAS). */
  fixedIssuesCount: number;
  /** Trayectoria: scores de las últimas ≤10 auditorías completadas, DESC. */
  priorScores: Array<{ date: string; score: number }>;
  audience: 'client' | 'internal';
}

export interface ExecSummary {
  verdict: ExecSummaryVerdict;
  healthScore: number;
  delta: { value: number | null; dir: 'up' | 'down' | 'flat' };
  severityDist: { critical: number; warning: number; info: number };
  categoryDist: Record<ExecSummaryCategory, number>;
  topRisks: Array<{ severity: ExecSummarySeverity; title: string; url: string | null; recommendation: string | null; category: ExecSummaryCategory }>;
  quickWins: Array<{ title: string; effort: ExecSummaryEffort; impact: ExecSummaryImpact }>;
  trajectory: Array<{ date: string; score: number }>;
  newIssues: number;
  resolvedIssues: number;
  audience: 'client' | 'internal';
}

/** Veredicto por umbrales del spec: ≥75 ok · ≥40 warn · <40 critical. */
export function verdictFromScore(score: number): ExecSummaryVerdict {
  if (score >= 75) return 'ok';
  if (score >= 40) return 'warn';
  return 'critical';
}

/**
 * PDF cliente: solo ruta sin querystring (sin host, sin tokens de query).
 * HTML interno pasa la URL completa (audience='internal').
 */
export function sanitizeUrlForClient(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/[^/]+(\/[^?#]*)?/);
  return m ? (m[1] ?? '/') : url;
}

/** Heurística de esfuerzo del spec §2 (data-driven; sin IA en el núcleo). */
const EFFORT_BY_CATEGORY: Record<ExecSummaryCategory, ExecSummaryEffort> = {
  meta: 'S',
  seo: 'M',
  link: 'M',
  security: 'M',
  accessibility: 'M',
  performance: 'L',
};

const IMPACT_BY_SEVERITY: Record<ExecSummarySeverity, ExecSummaryImpact> = {
  critical: 'alto',
  warning: 'medio',
  info: 'bajo',
};

const SEV_RANK: Record<ExecSummarySeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Score de salud: criterio del portal (exec-brief): 10/3/1. */
export function auditHealthScore(sev: { critical: number; warning: number; info: number }): number {
  return Math.max(0, 100 - (sev.critical * 10 + sev.warning * 3 + sev.info * 1));
}

/** Matriz impacto×esfuerzo: contadores por celda (renderers la dibujan). */
export function quickWinsMatrixCount(
  quickWins: ExecSummary['quickWins'],
): Record<ExecSummaryImpact, Record<ExecSummaryEffort, number>> {
  const empty = (): Record<ExecSummaryEffort, number> => ({ S: 0, M: 0, L: 0 });
  const out: Record<ExecSummaryImpact, Record<ExecSummaryEffort, number>> = {
    alto: empty(), medio: empty(), bajo: empty(),
  };
  for (const q of quickWins) out[q.impact][q.effort] += 1;
  return out;
}

export function reduceExecSummary(input: ExecSummaryInput): ExecSummary {
  const severityDist = { critical: 0, warning: 0, info: 0 };
  const categoryDist: Record<ExecSummaryCategory, number> = {
    seo: 0, meta: 0, performance: 0, security: 0, accessibility: 0, link: 0,
  };
  for (const iss of input.issues) {
    severityDist[iss.severity] += 1;
    if (categoryDist[iss.category] !== undefined) categoryDist[iss.category] += 1;
  }

  const healthScore = auditHealthScore(severityDist);
  const verdict = verdictFromScore(healthScore);

  const delta = input.priorAudit
    ? {
        value: healthScore - input.priorAudit.score,
        dir: healthScore > input.priorAudit.score ? ('up' as const)
          : healthScore < input.priorAudit.score ? ('down' as const) : ('flat' as const),
      }
    : { value: null, dir: 'flat' as const };

  // Top riesgos: críticos primero, máx 5. Sanitización por audiencia.
  const topRisksFull = [...input.issues]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 5)
    .map((iss) => ({
      severity: iss.severity,
      title: iss.title,
      url: input.audience === 'client' ? sanitizeUrlForClient(iss.url) : iss.url,
      recommendation: iss.recommendation,
      category: iss.category,
    }));

  const quickWins = [...input.issues]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 8)
    .map((iss) => ({
      title: iss.title,
      effort: EFFORT_BY_CATEGORY[iss.category] ?? 'M',
      impact: IMPACT_BY_SEVERITY[iss.severity],
    }));

  const trajectory = [
    ...(input.priorAudit
      ? [{ date: input.priorAudit.completedAt?.toISOString().slice(0, 10) ?? '', score: input.priorAudit.score }]
      : []),
    ...input.priorScores,
  ].slice(0, 10).sort((a, b) => a.date.localeCompare(b.date));

  // NUEVOS: issues de la auditoría actual que no están en la previa
  // (match por url+title; url puede ser null → match por title+category).
  const keyOf = (i: ExecSummaryRow) => `${i.url ?? ''}|${i.title}|${i.category}`;
  const priorKeys = new Set(input.priorIssues.map(keyOf));
  const newIssues = input.issues.filter((i) => !priorKeys.has(keyOf(i))).length;

  // Corrección documentada del plan: el spec muestra resueltos en ambas
  // audiencias → sin resolvedVisibility, se cuenta fixedIssuesCount directo.
  const resolvedIssues = input.fixedIssuesCount;

  return {
    verdict, healthScore, delta, severityDist, categoryDist, topRisks: topRisksFull,
    quickWins, trajectory, newIssues, resolvedIssues, audience: input.audience,
  };
}
