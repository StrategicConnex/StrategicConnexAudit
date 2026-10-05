/**
 * health-score.ts — fórmula única de "Salud" del proyecto (0-100).
 *
 * La usan tanto el dashboard (ProjectCard vía app/page.tsx) como el detalle
 * /projects/[id]: los issues críticos restan 15 puntos y las advertencias 5,
 * con suelo en 0. Centralizarla evita que cada pantalla calcule (o invente)
 * su propio número.
 */
export function healthFromIssueCounts(criticals: number, warnings: number): number {
  return Math.max(0, 100 - criticals * 15 - warnings * 5);
}
