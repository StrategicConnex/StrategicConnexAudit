/**
 * detector.ts — Anomaly Detection Engine (P3.2)
 *
 * Moving Z-score anomaly detector on uptime latency and error rates.
 * Thresholds: |Z|>2 info | |Z|>3 warning | |Z|>5 critical
 */

import { db } from "@/shared/db";
import { sql } from "drizzle-orm";
import { anomalyDetections } from "@/shared/db/schemas/anomaly";
import type { AnomalyMetricType, AnomalySeverity } from "@/shared/db/schemas/anomaly";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

const Z_INFO = 2;
const Z_WARN = 3;
const Z_CRIT = 5;

interface DetectorInput {
  projectId: string;
  investigationId?: string;
  metricType: AnomalyMetricType;
  historicalValues: number[];
  currentValue: number;
  label: string;
  detail?: string;
  windowSizeHours?: number;
  metadata?: Record<string, unknown>;
}

interface DetectorOutput {
  anomaly: boolean;
  zScore: number;
  mean: number;
  stdDev: number;
  severity: AnomalySeverity | null;
}

export interface AnomalyDetectionSummary {
  metricType: AnomalyMetricType;
  checked: boolean;
  reason?: string;
  anomalies: number;
  anomalyId?: string;
  severity?: AnomalySeverity;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────

export function calculateZScore(input: DetectorInput): DetectorOutput {
  const { historicalValues, currentValue } = input;
  const n = historicalValues.length;

  if (n < 3) {
    return { anomaly: false, zScore: 0, mean: 0, stdDev: 0, severity: null };
  }

  const sum = historicalValues.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = historicalValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { anomaly: false, zScore: 0, mean, stdDev: 0, severity: null };
  }

  const zScore = (currentValue - mean) / stdDev;
  const absZ = Math.abs(zScore);

  let severity: AnomalySeverity | null = null;
  let anomaly = false;

  if (absZ > Z_CRIT) { severity = "critical"; anomaly = true; }
  else if (absZ > Z_WARN) { severity = "warning"; anomaly = true; }
  else if (absZ > Z_INFO) { severity = "info"; anomaly = true; }

  return { anomaly, zScore, mean, stdDev, severity };
}

export async function persistAnomaly(
  input: DetectorInput,
  output: DetectorOutput
): Promise<string | null> {
  if (!output.anomaly || !output.severity) return null;

  try {
    const [record] = await db.insert(anomalyDetections).values({
      projectId: input.projectId,
      investigationId: input.investigationId ?? null,
      metricType: input.metricType,
      severity: output.severity,
      actualValue: String(input.currentValue),
      expectedValue: String(output.mean),
      zScore: String(output.zScore),
      windowSizeHours: input.windowSizeHours ?? 24,
      label: input.label,
      detail: input.detail ?? null,
      metadata: input.metadata ?? {},
    }).returning({ id: anomalyDetections.id });

    return record?.id ?? null;
  } catch (err) {
    logger.error("[AnomalyDetector] Error persisting anomaly:", { error: getErrorMessage(err) });
    return null;
  }
}

// ─── Detectores ──────────────────────────────────────────────────────────────

export async function detectLatencyAnomalies(
  projectId: string,
  opts?: { windowHours?: number }
): Promise<AnomalyDetectionSummary> {
  const windowHours = opts?.windowHours ?? 24;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await db.execute(
    sql`
      SELECT response_time_ms FROM uptime_logs
      WHERE project_id = ${projectId}
        AND response_time_ms IS NOT NULL
        AND checked_at >= ${since}
      ORDER BY checked_at DESC
    `
  );

  const values = (rows.rows as Array<{ response_time_ms: number }>).map((r) => Number(r.response_time_ms));

  if (values.length < 5) {
    return { metricType: "latency", checked: false, reason: "insufficient data", anomalies: 0 };
  }

  const currentValue = values[0]!;
  const hist = values.slice(1);
  const histMean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const label = `Pico de latencia: ${currentValue.toFixed(0)}ms`;
  const detail = `Actual: ${currentValue}ms. Media (${windowHours}h): ${histMean.toFixed(0)}ms`;

  const result = calculateZScore({
    projectId, metricType: "latency",
    historicalValues: hist, currentValue,
    label, detail, windowSizeHours: windowHours,
  });

  if (result.anomaly) {
    const id = await persistAnomaly(
      { projectId, metricType: "latency", historicalValues: hist, currentValue, label: result.severity === "critical" ? `Latencia critica: ${currentValue.toFixed(0)}ms` : `Latencia elevada: ${currentValue.toFixed(0)}ms`, detail, windowSizeHours: windowHours, metadata: { windowSize: hist.length, currentValue, mean: result.mean, stdDev: result.stdDev } },
      result
    );
    return { metricType: "latency", checked: true, anomalies: id ? 1 : 0, anomalyId: id ?? undefined, severity: result.severity ?? undefined };
  }

  return { metricType: "latency", checked: true, anomalies: 0 };
}

export async function detectErrorRateAnomalies(
  projectId: string,
  investigationId?: string,
  opts?: { windowHours?: number }
): Promise<AnomalyDetectionSummary> {
  const windowHours = opts?.windowHours ?? 24;

  const rows = await db.execute(
    sql`
      SELECT date_trunc('hour', created_at) as bucket, count(*) as cnt
      FROM intelligence_run_events
      WHERE project_id = ${projectId}
        AND event_type = 'error'
        AND created_at >= now() - interval '${sql.raw(String(windowHours))} hours'
      GROUP BY bucket
      ORDER BY bucket DESC
    `
  );

  const buckets = rows.rows as Array<{ bucket: string; cnt: number }>;
  const counts = buckets.map((r) => Number(r.cnt));

  if (counts.length < 3) {
    return { metricType: "error_rate", checked: false, reason: "insufficient data", anomalies: 0 };
  }

  const currentCount = counts[0] ?? 0;
  const histCounts = counts.slice(1);

  if (currentCount === 0 && histCounts.every((c: number) => c === 0)) {
    return { metricType: "error_rate", checked: true, anomalies: 0 };
  }

  const label = `Pico de errores: ${currentCount} eventos/hora`;
  const detail = `Eventos error ultima hora: ${currentCount}. Ventana: ${windowHours}h`;

  const result = calculateZScore({
    projectId, investigationId, metricType: "error_rate",
    historicalValues: histCounts, currentValue: currentCount,
    label, detail, windowSizeHours: windowHours,
  });

  if (result.anomaly) {
    const id = await persistAnomaly(
      { projectId, investigationId, metricType: "error_rate", historicalValues: histCounts, currentValue: currentCount, label, detail, windowSizeHours: windowHours, metadata: { windowBuckets: histCounts.length, currentCount, mean: result.mean } },
      result
    );
    return { metricType: "error_rate", checked: true, anomalies: id ? 1 : 0, anomalyId: id ?? undefined, severity: result.severity ?? undefined };
  }

  return { metricType: "error_rate", checked: true, anomalies: 0 };
}

export async function runAllDetections(
  projectId: string,
  opts?: { windowHours?: number }
): Promise<AnomalyDetectionSummary[]> {
  return [
    await detectLatencyAnomalies(projectId, opts),
    await detectErrorRateAnomalies(projectId, undefined, opts),
  ];
}
