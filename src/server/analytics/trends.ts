/**
 * trends.ts — Series temporales de postura (B9).
 *
 * El dato existe disperso (`audits` + `issues`, el ciclo de vida de
 * `intelligence_findings`, `uptime_logs`) pero nunca se mostró como serie: el
 * analista veía el número de hoy sin poder saber si la última semana fue
 * mejor o peor.
 *
 * Tres medidas, tres fuentes, una regla común: un punto sin mediciones es un
 * hueco, no un cero. Rellenar con 0 convierte "no medimos" en "fallamos", que
 * es la lectura más dangerously falsa posible en un tablero de seguridad.
 *
 * Puro: recibe filas planas, devuelve series con los buckets que sí tienen
 * datos. La carga SQL vive en queries.ts.
 */

export const TREND_BUCKETS = ["day", "week", "month"] as const;
export type TrendBucket = (typeof TREND_BUCKETS)[number];

export function isTrendBucket(value: string): value is TrendBucket {
  return (TREND_BUCKETS as readonly string[]).includes(value);
}

export interface ScorePointRow {
  auditId: string;
  projectId: string;
  completedAt: Date | string;
  criticalIssues: number;
  warningIssues: number;
}

export interface FindingDurationRow {
  createdAt: Date | string;
  resolvedAt: Date | string;
}

export interface UptimeSampleRow {
  isUp: boolean;
  checkedAt: Date | string;
}

export interface TrendPoint {
  /** Inicio del bucket en ISO (UTC). */
  bucketStart: string;
  /** Auditorías completadas en el bucket; 0 = bucket sin auditorías. */
  audits: number;
  /** Media de salud 0-100 de esas auditorías; null si no hubo ninguna. */
  score: number | null;
  criticalIssues: number;
  warningIssues: number;
  /** Hallazgos resueltos en el bucket. */
  resolved: number;
  /** MTTR en horas de los hallazgos resueltos en el bucket; null si ninguno. */
  mttrHours: number | null;
}

export interface UptimePoint {
  bucketStart: string;
  checks: number;
  up: number;
  /** % de checks con isUp; null si no hubo checks. */
  uptimePct: number | null;
}

export interface TrendsReport {
  bucket: TrendBucket;
  points: TrendPoint[];
  uptime: UptimePoint[];
  /** Score medio de los puntos que lo tienen; null si ninguno. */
  latestScore: number | null;
  /** Variación frente al punto anterior con score; null si no hay dos. */
  scoreDelta: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  /** Hallazgos resueltos en toda la ventana. */
  resolvedInWindow: number;
  /** Hallazgos que siguen abiertos al cerrar la ventana. */
  stillOpen: number;
  /** % de uptime de toda la ventana ponderado por checks; null sin checks. */
  uptimePct: number | null;
  coverage: {
    buckets: number;
    withScore: number;
    withUptime: number;
  };
}

const BUCKET_MS: Record<TrendBucket, number> = {
  day: 86_400_000,
  week: 604_800_000,
  month: 2_629_746_000, // promedio Gregorian: 30.436875 días
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**.floor del timestamp al inicio de su bucket, en UTC. */
export function bucketStart(iso: Date | string, bucket: TrendBucket): number {
  const t = new Date(iso).getTime();
  const date = new Date(t);
  switch (bucket) {
    case "day":
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    case "week": {
      date.setUTCHours(0, 0, 0, 0);
      // Lunes = inicio de semana ISO.
      const dow = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - dow);
      return date.getTime();
    }
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
}

function toMillis(value: Date | string): number | null {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function healthScore(critical: number, warnings: number): number {
  return Math.max(0, 100 - critical * 15 - warnings * 5);
}

/** Agrupa auditorías por bucket con su score de salud. */
export function scoreSeries(
  audits: ScorePointRow[],
  bucket: TrendBucket
): Array<{ bucketStart: number; score: number | null; audits: number; critical: number; warnings: number }> {
  const groups = new Map<number, { scores: number[]; critical: number; warnings: number; count: number }>();

  for (const audit of audits) {
    const t = toMillis(audit.completedAt);
    if (t === null) continue;
    const key = bucketStart(audit.completedAt, bucket);
    let g = groups.get(key);
    if (!g) {
      g = { scores: [], critical: 0, warnings: 0, count: 0 };
      groups.set(key, g);
    }
    g.scores.push(healthScore(audit.criticalIssues, audit.warningIssues));
    g.critical += audit.criticalIssues;
    g.warnings += audit.warningIssues;
    g.count += 1;
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      bucketStart: key,
      score: round1(g.scores.reduce((sum, s) => sum + s, 0) / g.scores.length),
      audits: g.count,
      critical: g.critical,
      warnings: g.warnings,
    }))
    .sort((a, b) => a.bucketStart - b.bucketStart);
}

/** Agrupa resoluciones por bucket y calcula el MTTR de cada uno. */
export function mttrSeries(
  findings: FindingDurationRow[],
  bucket: TrendBucket
): Array<{ bucketStart: number; mttrHours: number; resolved: number }> {
  const groups = new Map<number, { hours: number[] }>();

  for (const finding of findings) {
    const created = toMillis(finding.createdAt);
    const resolved = toMillis(finding.resolvedAt);
    if (created === null || resolved === null) continue;
    const hours = (resolved - created) / 3_600_000;
    if (hours <= 0) continue;
    const key = bucketStart(finding.resolvedAt, bucket);
    let g = groups.get(key);
    if (!g) {
      g = { hours: [] };
      groups.set(key, g);
    }
    g.hours.push(hours);
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      bucketStart: key,
      mttrHours: round1(g.hours.reduce((sum, h) => sum + h, 0) / g.hours.length),
      resolved: g.hours.length,
    }))
    .sort((a, b) => a.bucketStart - b.bucketStart);
}

/** Agrupa comprobaciones de uptime por bucket. */
export function uptimeSeries(
  samples: UptimeSampleRow[],
  bucket: TrendBucket
): Array<{ bucketStart: number; checks: number; up: number; uptimePct: number | null }> {
  const groups = new Map<number, { checks: number; up: number }>();

  for (const sample of samples) {
    if (toMillis(sample.checkedAt) === null) continue;
    const key = bucketStart(sample.checkedAt, bucket);
    let g = groups.get(key);
    if (!g) {
      g = { checks: 0, up: 0 };
      groups.set(key, g);
    }
    g.checks += 1;
    if (sample.isUp) g.up += 1;
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      bucketStart: key,
      checks: g.checks,
      up: g.up,
      uptimePct: g.checks === 0 ? null : round1((g.up / g.checks) * 100),
    }))
    .sort((a, b) => a.bucketStart - b.bucketStart);
}

export interface BuildTrendsInput {
  audits: ScorePointRow[];
  resolvedFindings: FindingDurationRow[];
  stillOpen: number;
  uptimeSamples: UptimeSampleRow[];
  bucket: TrendBucket;
}

/**
 * Combina las tres series sobre la misma rejilla de buckets. Solo se emiten
 * los buckets con alguna medición: un bucket vacío en medio de la serie es
 * ruido, y su ausencia ya comunica que no había datos.
 */
export function buildTrends(input: BuildTrendsInput): TrendsReport {
  const { bucket } = input;
  const scores = scoreSeries(input.audits, bucket);
  const mttrs = mttrSeries(input.resolvedFindings, bucket);
  const uptimes = uptimeSeries(input.uptimeSamples, bucket);

  const keys = new Set<number>([
    ...scores.map((s) => s.bucketStart),
    ...mttrs.map((m) => m.bucketStart),
    ...uptimes.map((u) => u.bucketStart),
  ]);

  const scoreByKey = new Map(scores.map((s) => [s.bucketStart, s]));
  const mttrByKey = new Map(mttrs.map((m) => [m.bucketStart, m]));

  const points: TrendPoint[] = Array.from(keys)
    .sort((a, b) => a - b)
    .map((key) => {
      const s = scoreByKey.get(key);
      const m = mttrByKey.get(key);
      return {
        bucketStart: new Date(key).toISOString(),
        audits: s?.audits ?? 0,
        score: s?.score ?? null,
        criticalIssues: s?.critical ?? 0,
        warningIssues: s?.warnings ?? 0,
        resolved: m?.resolved ?? 0,
        mttrHours: m?.mttrHours ?? null,
      };
    });

  const scoredPoints = points.filter((p) => p.score !== null);
  const latestScore = scoredPoints.length > 0 ? scoredPoints[scoredPoints.length - 1]!.score : null;
  const previousScore =
    scoredPoints.length >= 2 ? scoredPoints[scoredPoints.length - 2]!.score : null;
  const scoreDelta =
    latestScore !== null && previousScore !== null ? round1(latestScore - previousScore) : null;

  let direction: TrendsReport["direction"] = "unknown";
  if (scoreDelta !== null) {
    if (scoreDelta > 0) direction = "up";
    else if (scoreDelta < 0) direction = "down";
    else direction = "flat";
  }

  const uptimePoints: UptimePoint[] = uptimes.map((u) => ({
    bucketStart: new Date(u.bucketStart).toISOString(),
    checks: u.checks,
    up: u.up,
    uptimePct: u.uptimePct,
  }));
  const totalChecks = uptimes.reduce((sum, u) => sum + u.checks, 0);
  const totalUp = uptimes.reduce((sum, u) => sum + u.up, 0);

  return {
    bucket,
    points,
    uptime: uptimePoints,
    latestScore,
    scoreDelta,
    direction,
    resolvedInWindow: mttrs.reduce((sum, m) => sum + m.resolved, 0),
    stillOpen: input.stillOpen,
    uptimePct: totalChecks === 0 ? null : round1((totalUp / totalChecks) * 100),
    coverage: {
      buckets: points.length,
      withScore: scoredPoints.length,
      withUptime: uptimePoints.filter((u) => u.uptimePct !== null).length,
    },
  };
}

/**
 * Recorta las series a las últimas `window` unidades de bucket, dejando como
 * mínimo `minPoints` para que un token con un solo dato no pinte una línea
 * recta que sugiere tendencia.
 */
export function clampToWindow<T extends { bucketStart: string }>(
  series: T[],
  bucket: TrendBucket,
  window: number,
  minPoints = 2
): T[] {
  const effective = Math.max(window, minPoints);
  return series.slice(Math.max(0, series.length - effective));
}

/** Rango de la ventana en ISO, para que la UI rotule "últimos N días". */
export function windowRange(bucket: TrendBucket, window: number, now = Date.now()): { from: string; to: string } {
  const span = BUCKET_MS[bucket] * window;
  return { from: new Date(now - span).toISOString(), to: new Date(now).toISOString() };
}