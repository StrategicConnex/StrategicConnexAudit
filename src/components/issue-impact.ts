/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT issue-impact — puntuación de impacto SEO por hallazgo.
   Módulo puro (sin deps de servidor): lo usan la página de resultados
   (orden server-side) y las IssueCard (display client-side).
   Semana 8 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export type IssueSeverity = 'critical' | 'warning' | 'info';

export type IssueCategory =
  | 'meta'
  | 'seo'
  | 'performance'
  | 'link'
  | 'accessibility'
  | 'security';

export interface ImpactInput {
  severity: string;
  category: string;
}

export interface ImpactScore {
  score: number;
  difficulty: string;
  roi: string;
  urgency: string;
}

export function calculateImpactScore(issue: ImpactInput): ImpactScore {
  let score = 50;
  let difficulty = 'Media';
  let roi = 'Medio';
  let urgency = 'Normal';

  // Peso por gravedad
  if (issue.severity === 'critical') {
    score += 30;
    urgency = 'Alta';
    roi = 'Alto';
  } else if (issue.severity === 'warning') {
    score += 10;
  }

  // Ajuste fino por categoría (impacto algorítmico estimado)
  switch (issue.category) {
    case 'meta':
    case 'seo':
      score += 15;
      difficulty = 'Baja'; // Fácil de cambiar texto
      if (issue.severity === 'critical') roi = 'Muy Alto'; // Ej. Falta Title
      break;
    case 'performance':
      score += 10;
      difficulty = 'Alta'; // Optimizar LCP o JS es difícil
      break;
    case 'accessibility':
      score += 5;
      difficulty = 'Media';
      break;
    case 'link':
      score += 12;
      difficulty = 'Baja';
      break;
    case 'security':
      score += 20;
      difficulty = 'Media';
      urgency = 'Alta';
      break;
  }

  // Normalizar a 100
  score = Math.min(100, Math.max(1, score));

  return { score, difficulty, roi, urgency };
}

/** Ordena por impacto descendente (los más urgentes primero). */
export function sortIssuesByImpact<T extends ImpactInput>(issues: T[]): T[] {
  return [...issues].sort(
    (a, b) => calculateImpactScore(b).score - calculateImpactScore(a).score,
  );
}
