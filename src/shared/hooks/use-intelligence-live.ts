'use client';

import { useQuery } from '@tanstack/react-query';

export interface IntelligenceLive {
  connected: boolean;
  uptime: number;
  threats: number;
  latency: number;
  lastScan: string | null;
}

export interface IntelligenceData {
  live: IntelligenceLive | null;
  stats: {
    totalAssets: number;
    activeAlerts: number;
    resolvedToday: number;
  } | null;
}

async function fetchIntelligenceLive(projectId?: string): Promise<IntelligenceData> {
  const params = projectId ? `?projectId=${projectId}` : '';

  const results = await Promise.allSettled([
    fetch(`/api/intelligence/live${params}`).then(async (r) => {
      if (r.status === 401) return null;
      const data = await r.json();
      return data.success ? data : null;
    }),
    fetch(`/api/intelligence/stats${params}`).then(async (r) => {
      if (r.status === 401) return null;
      const data = await r.json();
      return data.success ? data : null;
    }),
  ]);

  return {
    live: results[0].status === 'fulfilled' ? results[0].value : null,
    stats: results[1].status === 'fulfilled' ? results[1].value : null,
  };
}

/**
 * Hook for fetching intelligence live data (used in OverviewTab).
 * Uses Promise.allSettled to avoid one failed request blocking the other.
 */
export function useIntelligenceLive(projectId?: string) {
  return useQuery({
    queryKey: ['intelligence-live', projectId],
    queryFn: () => fetchIntelligenceLive(projectId),
    staleTime: 15_000,
    refetchInterval: 30_000, // Live data needs frequent updates
  });
}
