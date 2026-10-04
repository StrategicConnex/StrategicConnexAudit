/**
 * Tiers del ScoreGauge alineados a los tokens semánticos del DS
 * (--chart-success/--chart-warning/--chart-danger). Los colores llegan
 * resueltos por tema vía useChartColors() — el tier ámbar "Advertencia"
 * es semántico (severidad), no de marca, y conserva su hue 85.
 *
 * El glow se construye con color-mix() porque los tokens llegan como
 * `oklch(...)` y no se pueden interpolar rgba() a mano.
 */

export interface TierColors {
  success: string;
  warning: string;
  danger: string;
}

export interface ScoreConfig {
  label: string;
  color: string;
  glow: string;
  glowSoft: string;
  textColor: string;
  bg: string;
}

export function getScoreConfig(score: number, c: TierColors): ScoreConfig {
  if (score >= 70) {
    return {
      label: score >= 85 ? "Excelente" : "Bueno",
      color: c.success,
      glow: `color-mix(in srgb, ${c.success} 50%, transparent)`,
      glowSoft: `color-mix(in srgb, ${c.success} 12%, transparent)`,
      textColor: "text-chart-success",
      bg: "bg-chart-success/10 border-chart-success/20",
    };
  }
  if (score >= 50) {
    return {
      label: "Advertencia",
      color: c.warning,
      glow: `color-mix(in srgb, ${c.warning} 50%, transparent)`,
      glowSoft: `color-mix(in srgb, ${c.warning} 12%, transparent)`,
      textColor: "text-chart-warning",
      bg: "bg-chart-warning/10 border-chart-warning/20",
    };
  }
  return {
    label: score >= 30 ? "Crítico" : "Peligro",
    color: c.danger,
    glow: `color-mix(in srgb, ${c.danger} 50%, transparent)`,
    glowSoft: `color-mix(in srgb, ${c.danger} 12%, transparent)`,
    textColor: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  };
}
