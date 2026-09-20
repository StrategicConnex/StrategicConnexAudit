import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useWebhooks } from './use-webhooks';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useWebhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when projectId is null', () => {
    const { result } = renderHook(() => useWebhooks(null), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.webhooks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches webhooks when projectId is provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        webhooks: [{ id: '1', url: 'https://hook.example.com', events: ['audit.complete'], projectId: 'p1', active: true, createdAt: '2026-01-01' }],
      }),
    });

    const { result } = renderHook(() => useWebhooks('p1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.webhooks).toHaveLength(1);
    expect(result.current.webhooks[0].url).toBe('https://hook.example.com');
  });

  it('createWebhook calls POST with correct params', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, webhooks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, webhook: { id: '2', url: 'https://new.hook.com' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, webhooks: [{ id: '2', url: 'https://new.hook.com' }] }),
      });

    const { result } = renderHook(() => useWebhooks('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createWebhook.mutateAsync({ url: 'https://new.hook.com', events: ['audit.complete'] });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/webhooks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1', url: 'https://new.hook.com', events: ['audit.complete'] }),
    }));
  });
});
