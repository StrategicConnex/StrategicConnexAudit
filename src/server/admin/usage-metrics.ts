/**
 * usage-metrics.ts — Reducer puro del panel de uso (Q4 6.5).
 * Sin I/O: las server actions (actions.ts) hacen las queries y llaman aquí.
 * Escala de severidad INTELIGENCIA: critical|high|medium|low (≠ auditorías
 * critical|warning|info — NO se mezclan dominios).
 */

export type SeverityIntelligence = "critical" | "high" | "medium" | "low";

export type UsageMetrics = {
  totalUsers: number;
  totalProjects: number;
  auditsLast30d: number;
  findingsLast30d: number;
  findingsBySeverity: Record<SeverityIntelligence, number>;
  activeUsersLast7d: number;
  aiCallsLast30d: number;
  aiTokensLast30d: { in: number; out: number };
  aiCostUsdLast30d: number;
  aiCacheHitsLast30d: { hits: number; total: number };
};

const EMPTY_SEVERITY: Record<SeverityIntelligence, number> = {
  critical: 0, high: 0, medium: 0, low: 0,
};

export function reduceUsageMetrics(input: {
  totalUsers: number;
  totalProjects: number;
  auditsLast30d: number;
  findingsLast30d: Array<{ severity: string; n: number }>;
  activeUsersLast7d: number;
  aiLast30d: {
    calls: number;
    tokensIn: number | null;
    tokensOut: number | null;
    costUsd: number | null;
    cacheHits: number;
  };
}): UsageMetrics {
  const bySeverity = { ...EMPTY_SEVERITY };
  let findingsTotal = 0;
  for (const row of input.findingsLast30d) {
    const tilt = row.severity as SeverityIntelligence;
    const n = row.n ?? 0;
    if (tilt in bySeverity) {
      bySeverity[tilt] += n;
      findingsTotal += n;
    }
  }

  return {
    totalUsers: input.totalUsers ?? 0,
    totalProjects: input.totalProjects ?? 0,
    auditsLast30d: input.auditsLast30d ?? 0,
    findingsLast30d: findingsTotal,
    findingsBySeverity: bySeverity,
    activeUsersLast7d: input.activeUsersLast7d ?? 0,
    aiCallsLast30d: input.aiLast30d?.calls ?? 0,
    aiTokensLast30d: {
      in: input.aiLast30d?.tokensIn ?? 0,
      out: input.aiLast30d?.tokensOut ?? 0,
    },
    aiCostUsdLast30d: input.aiLast30d?.costUsd ?? 0,
    aiCacheHitsLast30d: {
      hits: input.aiLast30d?.cacheHits ?? 0,
      total: input.aiLast30d?.calls ?? 0,
    },
  };
}
