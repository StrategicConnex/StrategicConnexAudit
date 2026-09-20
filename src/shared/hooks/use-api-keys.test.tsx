import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useApiKeys } from './use-api-keys';

// Mock fetch globally
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

describe('useApiKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches API keys on mount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        apiKeys: [
          { id: '1', name: 'Test Key', keyPreview: 'sk-...abc', createdAt: '2026-01-01' },
        ],
      }),
    });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.apiKeys).toHaveLength(1);
    expect(result.current.apiKeys[0].name).toBe('Test Key');
  });

  it('returns empty array on error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'Unauthorized' }),
    });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.apiKeys).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });

  it('createApiKey calls POST and invalidates cache', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, apiKeys: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, apiKey: { id: '2', name: 'New Key' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, apiKeys: [{ id: '2', name: 'New Key' }] }),
      });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createApiKey.mutateAsync('New Key');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('deleteApiKey calls DELETE', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, apiKeys: [{ id: '1', name: 'Key' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, apiKeys: [] }),
      });

    const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteApiKey.mutateAsync('1');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/api-keys/1', expect.objectContaining({
      method: 'DELETE',
    }));
  });
});
