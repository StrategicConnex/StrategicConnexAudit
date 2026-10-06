/**
 * portfolio.ts — Vista de portafolio / postura agregada (B2).
 *
 * El dashboard es una lista de cards: cada proyecto se juzga por separado y
 * nadie contesta "¿cómo estamos en total?". Este módulo aplana la pregunta a
 * roll-up cross-proyecto.
 *
 * Regla que atraviesa todo el módulo: los proyectos SIN datos no valen 0.
 * Un proyecto recién creado no tiene auditoría completada, luego no tiene
 * puntaje — tiene "desconocido". Promediarlo en 0 hundiría el score
 * corporativo de cualquier cartera que esté creciendo, que es justo el error
 * que hace inútil un tablero ejecutivo.
 *
 * Puro: recibe filas y devuelve el informe. La carga SQL vive en queries.ts.
 */

import { healthFromIssueCounts } from "@/shared/utils/health-score";

/** Severidades de `intelligence_findings.severity`. */
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export const FINDING_SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

/** Severidades de `issues.severity` (enums de Postgres, no el set de findings). */
export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info" | "none";

export interface ProjectRollupRow {
  id: string;
  name: string;
  domain: string;
  /** Auditoría completada más reciente, o null si el proyecto aún no tiene ninguna. */
  latestAuditAt: Date | string | null;
  /** Issues de esa auditoría: base del score de salud. */
  criticalIssues: number;
  warningIssues: number;
  /** Hallazgos de inteligencia por severidad, todos los estados del ciclo de vida. */
  openBySeverity: Record<string, number>;
  closedFindings: number;
  /** Hallazgos resueltos con createdAt y resolvedAt → MTTR por proyecto. */
  resolvedDurationsHours: Array<{ createdAt: Date | string; resolvedAt: Date | string }>;
}

export interface PortfolioProject {
  id: string;
  name: string;
  domain: string;
  /** 0-100 desde la última auditoría completada; null = sin datos. */
  healthScore: number | null;
  criticalIssues: number;
  warningIssues: number;
  openFindings: number;
  openCritical: number;
  closedFindings: number;
  /** Horas medias de resolución; null si no cerró nada. */
  mttrHours: number | null;
  lastAuditAt: string | null;
}

export interface PortfolioReport {
  /** Media de los proyectos CON score; null si ninguno tiene datos. */
  corporateScore: number | null;
  projectCount: number;
  /** Proyectos sin ninguna auditoría completada (excluidos de la media). */
  projectsWithoutData: number;
  totalCriticalIssues: number;
  totalWarningIssues: number;
  totalOpenFindings: number;
  totalOpenCritical: number;
  /** MTTR medio de los proyectos que cerraron algo, ponderado por cierres. */
  mttrHours: number | null;
  /** 5 proyectos con peor score (sin datos al final, no al principio). */
  worstProjects: PortfolioProject[];
  /** Todos los proyectos, ordenados por score ascendente. */
  projects: PortfolioProject[];
  /** Distribución de hallazgos abiertos por severidad. */
  openBySeverity: Record<FindingSeverity, number>;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * MTTR en horas. Se ignoran las duraciones <= 0 o no finitas: un
 * `resolved_at` anterior al `created_at` viene de una corrección manual y no
 * debe promediar hacia el negativo.
 */
export function meanResolutionHours(
  durations: Array<{ createdAt: Date | string; resolvedAt: Date | string }>
): number | null {
  const hours: number[] = [];
  for (const d of durations) {
    const created = new Date(d.createdAt).getTime();
    const resolved = new Date(d.resolvedAt).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(resolved)) continue;
    const diffHours = (resolved - created) / 3_600_000;
    if (diffHours > 0) hours.push(diffHours);
  }
  if (hours.length === 0) return null;
  const mean = hours.reduce((sum, h) => sum + h, 0) / hours.length;
  return Math.round(mean * 10) / 10;
}

export function buildPortfolio(rows: ProjectRollupRow[]): PortfolioReport {
  const openBySeverity = Object.fromEntries(FINDING_SEVERITIES.map((s) => [s, 0])) as Record<
    FindingSeverity,
    number
  >;

  const projects: PortfolioProject[] = rows.map((row) => {
    const hasAudit = row.latestAuditAt !== null;
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let openFindings = 0;
    for (const [severity, count] of Object.entries(row.openBySeverity)) {
      if (severity in counts && typeof count === "number" && count > 0) {
        counts[severity as FindingSeverity] = count;
        openFindings += count;
      }
    }
    for (const [severity, count] of Object.entries(counts)) {
      openBySeverity[severity as FindingSeverity] += count;
    }

    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      // Sin auditoría completada no hay score: `null`, no 0.
      healthScore: hasAudit
        ? healthFromIssueCounts(row.criticalIssues, row.warningIssues)
        : null,
      criticalIssues: row.criticalIssues,
      warningIssues: row.warningIssues,
      openFindings,
      openCritical: counts.critical,
      closedFindings: row.closedFindings,
      mttrHours: meanResolutionHours(row.resolvedDurationsHours),
      lastAuditAt: toIso(row.latestAuditAt),
    };
  });

  const scored = projects.filter((p) => p.healthScore !== null);
  const corporateScore =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, p) => sum + (p.healthScore ?? 0), 0) / scored.length);

  const totalResolved = projects.reduce((sum, p) => sum + p.closedFindings, 0);
  const weightedMttr =
    totalResolved === 0
      ? null
      : Math.round(
          (projects.reduce((sum, p) => sum + (p.mttrHours ?? 0) * p.closedFindings, 0) / totalResolved) * 10,
        ) / 10;

  // Peor primero; los proyectos sin datos al final (no son "lo peor", son
  // "lo que aún no sabemos") y por nombre para que el orden sea estable.
  const ordered = [...projects].sort((a, b) => {
    if (a.healthScore === null && b.healthScore === null) return a.name.localeCompare(b.name);
    if (a.healthScore === null) return 1;
    if (b.healthScore === null) return -1;
    return a.healthScore - b.healthScore || a.name.localeCompare(b.name);
  });

  return {
    corporateScore,
    projectCount: projects.length,
    projectsWithoutData: projects.length - scored.length,
    totalCriticalIssues: projects.reduce((sum, p) => sum + p.criticalIssues, 0),
    totalWarningIssues: projects.reduce((sum, p) => sum + p.warningIssues, 0),
    totalOpenFindings: projects.reduce((sum, p) => sum + p.openFindings, 0),
    totalOpenCritical: projects.reduce((sum, p) => sum + p.openCritical, 0),
    mttrHours: weightedMttr,
    worstProjects: ordered.filter((p) => p.healthScore !== null).slice(0, 5),
    projects: ordered,
    openBySeverity,
  };
}