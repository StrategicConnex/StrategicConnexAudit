import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useMonitoringData, useEntitlements } from './use-monitoring';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryWrapper";
  return Wrapper;
}

describe('useMonitoringData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when projectId is null', () => {
    const { result } = renderHook(() => useMonitoringData(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches monitoring data when projectId is provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        schedule: { enabled: true, interval: '24h', lastRunAt: '2026-01-01', nextRunAt: '2026-01-02' },
        alerts: [{ id: '1', type: 'drift', message: 'DNS changed', severity: 'high', createdAt: '2026-01-01', resolved: false }],
      }),
    });

    const { result } = renderHook(() => useMonitoringData('p1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.schedule?.enabled).toBe(true);
    expect(result.current.data?.alerts).toHaveLength(1);
  });
});

describe('useEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches entitlements/plans', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        plans: [
          { planId: 'free', planName: 'Free', maxProjects: 1, maxKeywords: 10, features: { seats: 1 }, priceMonthly: null },
        ],
      }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].planName).toBe('Free');
  });

  it('returns empty array when no plans', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useEntitlements(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });
});
