/**
 * forecast-math.ts — Regresión lineal + R² (C-1). Puro y testeable.
 *
 * Predice el valor en `horizonDays` ajustando y = a + b·x sobre promedios
 * diarios (x = índice de día 0..n-1). Sin datos suficientes (n<3) o serie
 * plana, retorna confianza 0 y el último valor como predicción.
 */

export interface ForecastInput {
  /** Promedios diarios ordenados (más viejo → más nuevo). */
  dailyAverages: number[];
  horizonDays?: number;
}

export interface ForecastOutput {
  current: number;
  predicted: number;
  slopePerDay: number;
  rSquared: number;
  trend: "up" | "down" | "flat";
  sampleDays: number;
}

export function linearForecast({ dailyAverages, horizonDays = 14 }: ForecastInput): ForecastOutput {
  const ys = dailyAverages.filter((v) => Number.isFinite(v));
  const n = ys.length;
  const current = n > 0 ? ys[n - 1]! : 0;

  if (n < 3) {
    return { current, predicted: current, slopePerDay: 0, rSquared: 0, trend: "flat", sampleDays: n };
  }

  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const predicted = intercept + slope * (n - 1 + horizonDays);

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i]! - meanY) ** 2;
    ssRes += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  const rel = meanY !== 0 ? slope / Math.abs(meanY) : 0;
  const trend = rel > 0.005 ? "up" : rel < -0.005 ? "down" : "flat";

  return { current, predicted, slopePerDay: slope, rSquared, trend, sampleDays: n };
}
