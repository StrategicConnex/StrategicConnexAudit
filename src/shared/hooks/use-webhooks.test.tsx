import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useWebhooks } from './use-webhooks';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
        webhooks: [{ id: '1', name: 'Hook', url: 'https://hook.example.com', events: ['finding.critical'], projectId: 'p1', active: true, createdAt: '2026-01-01' }],
      }),
    });

    const { result } = renderHook(() => useWebhooks('p1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.webhooks).toHaveLength(1);
    expect(result.current.webhooks[0].url).toBe('https://hook.example.com');
  });

  it('createWebhook envía name (obligatorio para la API) y eventos del catálogo', async () => {
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
      await result.current.createWebhook.mutateAsync({
        name: 'Alerta SOC',
        url: 'https://new.hook.com',
        events: ['finding.critical'],
      });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/webhooks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        projectId: 'p1',
        name: 'Alerta SOC',
        url: 'https://new.hook.com',
        events: ['finding.critical'],
        active: true,
      }),
    }));
  });

  it('deleteWebhook usa la ruta real (?id=&projectId=) y no /api/webhooks/<id>', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, webhooks: [] }),
    });

    const { result } = renderHook(() => useWebhooks('p1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteWebhook.mutateAsync('wh-9');
    });

    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'DELETE');
    expect(deleteCall?.[0]).toBe('/api/webhooks?id=wh-9&projectId=p1');
  });

  it('testWebhook devuelve el resultado real (incluye fallo 502 sin lanzar)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, webhooks: [] }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, delivered: 0, error: 'Endpoint respondió con status 500', status: 500 }),
      });

    const { result } = renderHook(() => useWebhooks('p1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome: Awaited<ReturnType<typeof result.current.testWebhook.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.testWebhook.mutateAsync('wh-1');
    });

    expect(outcome).toMatchObject({ success: false, delivered: 0, status: 500 });
    expect(fetchMock).toHaveBeenCalledWith('/api/webhooks/wh-1/test?projectId=p1', { method: 'POST' });
  });
});
