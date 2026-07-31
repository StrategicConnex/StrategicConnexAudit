/**
 * rendering/severity.ts — Badges de severidad y ratings de score (módulo hoja C01).
 *
 * Funciones puras sin dependencias de React ni estado. Extraídas de
 * IntelligenceTab para ser testables de forma aislada.
 */

export interface ScoreRating {
  label: string;
  color: string;
}

/**
 * Devuelve las clases Tailwind para el badge de una severidad.
 * Contrato: 'critical' | 'high' | 'medium' | 'low' | cualquier otro (info/default).
 */
export function getSeverityBadge(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'high':
      return 'text-destructive/80 bg-destructive/10 border-destructive/20';
    case 'medium':
      return 'text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20';
    case 'low':
      return 'text-primary bg-primary/10 border-primary/20';
    default:
      return 'text-muted-fg bg-muted/10 border-border/50';
  }
}

/**
 * Clasifica un score de seguridad (0-100) en un rating con etiqueta y clases.
 * Escala: A ≥90, B ≥80, C ≥70, D ≥50, F <50.
 */
export function getScoreRating(score: number): ScoreRating {
  if (score >= 90) return { label: 'A - Excelente', color: 'text-chartreuse border-chartreuse/20 bg-chartreuse/10' };
  if (score >= 80) return { label: 'B - Bueno', color: 'text-primary border-primary/20 bg-primary/10' };
  if (score >= 70) return { label: 'C - Advertencia', color: 'text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20 bg-[oklch(75% 0.13 80)]/10' };
  if (score >= 50) return { label: 'D - Alto Riesgo', color: 'text-destructive/80 border-destructive/20 bg-destructive/10' };
  return { label: 'F - Crítico', color: 'text-destructive border-destructive/20 bg-destructive/10' };
}
