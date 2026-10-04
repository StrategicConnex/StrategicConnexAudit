/**
 * score-tone.ts — Tono semántico compartido (gauge + barras). Fuente única
 * de umbrales (>=80 success, >=50 warning, resto danger).
 *
 * Sin directiva 'use client': función pura segura para Server Components.
 * (Antes vivía en ScoreGauge.tsx —módulo cliente— y llamarla desde
 * ProjectScoreCard provocaba 500 en producción: "Attempted to call
 * scoreTone() from the server but scoreTone is on the client".)
 */
export type ScoreTone = 'success' | 'warning' | 'danger';

export function scoreTone(value: number): ScoreTone {
  if (value >= 80) return 'success';
  if (value >= 50) return 'warning';
  return 'danger';
}
