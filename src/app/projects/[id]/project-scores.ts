/**
 * project-scores.ts — cálculos de puntuación de la página de detalle de
 * proyecto (/projects/[id]), extraídos a funciones puras para poder testear
 * los estados "sin datos" sin renderizar el server component.
 */

export type VitalStatus = "good" | "needs-improvement" | "poor" | "none";

export type UptimeStatus = "up" | "down" | "unknown";

export interface VitalsAveragesLike {
  LCP: number;
  CLS: number;
  FCP: number;
  INP: number;
  errorCount: number;
  TTFB: number;
}

/**
 * Umbrales por métrica (mismos que el UI). `rumEventCount` es el total de
 * eventos RUM registrados: sin NINGÚN evento no hay señal de errores, y la
 * ausencia de datos se marca 'none' — no 'good'. Un proyecto sin telemetría
 * no puede presumir 100% de rendimiento.
 */
export function computeVitalStatuses(v: VitalsAveragesLike, rumEventCount: number) {
  const lcpStatus: VitalStatus = v.LCP > 2500 ? "poor" : v.LCP > 0 ? "good" : "none";
  const clsStatus: VitalStatus = v.CLS > 0.1 ? "needs-improvement" : v.CLS > 0 ? "good" : "none";
  const fcpStatus: VitalStatus = v.FCP > 1800 ? "needs-improvement" : v.FCP > 0 ? "good" : "none";
  const inpStatus: VitalStatus =
    v.INP > 500 ? "poor" : v.INP > 200 ? "needs-improvement" : v.INP > 0 ? "good" : "none";
  const errStatus: VitalStatus =
    rumEventCount === 0
      ? "none"
      : v.errorCount > 5
        ? "poor"
        : v.errorCount > 0
          ? "needs-improvement"
          : "good";
  const memStatus: VitalStatus =
    v.TTFB > 1500 ? "poor" : v.TTFB > 800 ? "needs-improvement" : v.TTFB > 0 ? "good" : "none";
  return { lcpStatus, clsStatus, fcpStatus, inpStatus, errStatus, memStatus };
}

/**
 * Rendimiento = media ponderada (good 1, needs-improvement 0.5, poor 0),
 * excluyendo señales sin dato ('none'). null si no hay ninguna señal.
 */
export function computePerfScore(statuses: VitalStatus[]): number | null {
  const signals = statuses.filter((s) => s !== "none");
  if (signals.length === 0) return null;
  return Math.round(
    (signals.reduce((acc, s) => acc + (s === "good" ? 1 : s === "needs-improvement" ? 0.5 : 0), 0) /
      signals.length) *
      100
  );
}

export interface UptimeBadge {
  label: string;
  dotClassName: string;
  textClassName: string;
}

/**
 * Badge de disponibilidad con tres estados reales: 'unknown' (sin chequeos de
 * uptime) es "Sin datos" en neutro — jamás debe pintarse "Servidor Offline"
 * rojo solo porque nadie ha monitorizado el proyecto todavía. Acepta `string`
 * porque el valor viene de la BD: solo 'up'/'down' reciben etiqueta propia.
 */
export function uptimeBadge(status: string): UptimeBadge {
  if (status === "up") {
    return {
      label: "Servidor Online",
      dotClassName: "bg-chart-success shadow-[0_0_12px_var(--chart-success)]",
      textClassName: "text-foreground",
    };
  }
  if (status === "down") {
    return {
      label: "Servidor Offline",
      dotClassName: "bg-chart-danger shadow-[0_0_12px_var(--chart-danger)]",
      textClassName: "text-foreground",
    };
  }
  return {
    label: "Sin datos",
    dotClassName: "bg-muted-fg/50",
    textClassName: "text-muted-fg",
  };
}
