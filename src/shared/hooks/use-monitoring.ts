'use client';

import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

export interface MonitoringSchedule {
  enabled: boolean;
  interval: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface MonitoringAlert {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
}

export interface Entitlement {
  planId: string;
  planName: string;
  maxProjects: number;
  maxKeywords: number;
  seats: number;
  priceMonthly: number;
}

async function fetchMonitoringData(projectId: string): Promise<{
  schedule: MonitoringSchedule | null;
  alerts: MonitoringAlert[];
}> {
  const res = await fetch(`/api/monitoring?projectId=${projectId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch monitoring data');
  return {
    schedule: data.schedule || null,
    alerts: data.alerts || [],
  };
}

async function fetchEntitlements(): Promise<Entitlement[]> {
  const res = await fetch('/api/billing/entitlements');
  const data = await res.json();
  if (!data.plans) return [];
  return data.plans.map((p: Record<string, unknown>) => ({
    planId: p.planId as string,
    planName: p.planName as string,
    maxProjects: p.maxProjects as number,
    maxKeywords: p.maxKeywords as number,
    seats: (p.features as Record<string, unknown>)?.seats as number,
    priceMonthly: p.priceMonthly as number,
  }));
}

/**
 * Hook for fetching monitoring data (schedule + alerts) for a project.
 */
export function useMonitoringData(projectId: string | null) {
  return useQuery({
    queryKey: ['monitoring', projectId],
    queryFn: () => fetchMonitoringData(projectId!),
    enabled: !!projectId,
    staleTime: 15_000, // Monitoring data changes frequently
    refetchInterval: 30_000, // Auto-refresh every 30s
  });
}

/**
 * Hook for fetching billing entitlements/plans.
 */
export function useEntitlements() {
  return useQuery({
    queryKey: ['entitlements'],
    queryFn: fetchEntitlements,
    staleTime: 5 * 60_000, // Plans rarely change
  });
}
