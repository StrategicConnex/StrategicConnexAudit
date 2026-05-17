/**
 * StrategicAudit Pro — RUM Aggregation Engine
 * Pure mathematical utilities for computing Web Vitals, memory allocations,
 * and slow resources telemetry.
 */

export interface WebVitalLog {
  lcp?: number | string | null;
  cls?: number | string | null;
  fcp?: number | string | null;
  inp?: number | string | null;
  fid?: number | string | null;
  ttfb?: number | string | null;
  pageViews?: number | string | null;
  timeOnPage?: number | string | null;
  sessionDuration?: number | string | null;
  browser?: string | null;
  country?: string | null;
  errors?: unknown[] | null;
  resources?: { name: string; duration: number }[] | null;
  memory?: { usedJSHeapSize?: number } | null;
}

export interface VitalsAverages {
  LCP: number;
  CLS: number;
  FCP: number;
  INP: number;
  FID: number;
  TTFB: number;
  errorCount: number;
  totalPagesViews: number;
  avgTimeOnPage: number; // in seconds
  avgSessionDuration: number; // in seconds
  avgMemoryMB: string;
  topSlowResources: { name: string; duration: number }[];
  browsersMap: Record<string, number>;
  countriesMap: Record<string, number>;
}

/**
 * Aggregates raw client vitals logs into highly sophisticated average stats
 * @param vitalsLogs List of raw Web Vitals logs
 */
export function computeVitalsAverages(vitalsLogs: WebVitalLog[]): VitalsAverages {
  const totalLogs = vitalsLogs.length;

  let lcpSum = 0, lcpCount = 0;
  let clsSum = 0, clsCount = 0;
  let fcpSum = 0, fcpCount = 0;
  let inpSum = 0, inpCount = 0;
  let fidSum = 0, fidCount = 0;
  let ttfbSum = 0, ttfbCount = 0;

  let totalViews = 0;
  let totalPageTime = 0, pageTimeCount = 0;
  let totalSessionTime = 0, sessionTimeCount = 0;
  let errorCount = 0;

  const browsersMap: Record<string, number> = {};
  const countriesMap: Record<string, number> = {};
  const slowResourcesList: { name: string; duration: number }[] = [];

  for (const log of vitalsLogs) {
    if (log.lcp != null) { lcpSum += Number(log.lcp); lcpCount++; }
    if (log.cls != null) { clsSum += Number(log.cls); clsCount++; }
    if (log.fcp != null) { fcpSum += Number(log.fcp); fcpCount++; }
    if (log.inp != null) { inpSum += Number(log.inp); inpCount++; }
    if (log.fid != null) { fidSum += Number(log.fid); fidCount++; }
    if (log.ttfb != null) { ttfbSum += Number(log.ttfb); ttfbCount++; }

    if (log.pageViews != null) { totalViews += Number(log.pageViews); }
    if (log.timeOnPage != null) { totalPageTime += Number(log.timeOnPage); pageTimeCount++; }
    if (log.sessionDuration != null) { totalSessionTime += Number(log.sessionDuration); sessionTimeCount++; }

    if (log.browser) {
      browsersMap[log.browser] = (browsersMap[log.browser] || 0) + 1;
    }
    if (log.country) {
      countriesMap[log.country] = (countriesMap[log.country] || 0) + 1;
    }

    // Count errors safely
    if (log.errors && Array.isArray(log.errors)) {
      errorCount += log.errors.length;
    }

    // Collect resources safely
    if (log.resources && Array.isArray(log.resources)) {
      for (const res of log.resources) {
        if (res && res.name && res.duration != null) {
          slowResourcesList.push({ name: res.name, duration: Number(res.duration) });
        }
      }
    }
  }

  // Sort resources to get the top 5 slowest
  const topSlowResources = slowResourcesList
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  let memorySum = 0, memoryCount = 0;
  for (const log of vitalsLogs) {
    if (log.memory && typeof log.memory === 'object' && 'usedJSHeapSize' in log.memory) {
      const usedHeap = log.memory.usedJSHeapSize;
      if (usedHeap != null) {
        memorySum += Number(usedHeap);
        memoryCount++;
      }
    }
  }
  const avgMemoryMB = memoryCount > 0 ? (memorySum / memoryCount / (1024 * 1024)).toFixed(1) : '--';

  return {
    LCP: lcpCount > 0 ? lcpSum / lcpCount : 0,
    CLS: clsCount > 0 ? clsSum / clsCount : 0,
    FCP: fcpCount > 0 ? fcpSum / fcpCount : 0,
    INP: inpCount > 0 ? inpSum / inpCount : 0,
    FID: fidCount > 0 ? fidSum / fidCount : 0,
    TTFB: ttfbCount > 0 ? ttfbSum / ttfbCount : 0,
    errorCount,
    totalPagesViews: totalViews || totalLogs || 0,
    avgTimeOnPage: pageTimeCount > 0 ? Math.round(totalPageTime / pageTimeCount / 1000) : 0,
    avgSessionDuration: sessionTimeCount > 0 ? Math.round(totalSessionTime / sessionTimeCount / 1000) : 0,
    avgMemoryMB,
    topSlowResources,
    browsersMap,
    countriesMap
  };
}
