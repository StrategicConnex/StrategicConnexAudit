import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useProjectTeam } from './use-project-team';

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

describe('useProjectTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches team members on mount', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        members: [
          { id: '1', email: 'admin@test.com', role: 'owner', createdAt: '2026-01-01' },
          { id: '2', email: 'user@test.com', role: 'viewer', createdAt: '2026-01-02' },
        ],
        invitations: [],
        myRole: 'owner',
      }),
    });

    const { result } = renderHook(() => useProjectTeam('p1'), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.members).toHaveLength(2);
    expect(result.current.myRole).toBe('owner');
    expect(result.current.invitations).toEqual([]);
  });

  it('inviteMember calls POST and invalidates cache', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, members: [], invitations: [], myRole: 'owner' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Invitation sent' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, members: [], invitations: [{ id: 'inv1', email: 'new@test.com' }], myRole: 'owner' }),
      });

    const { result } = renderHook(() => useProjectTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.inviteMember.mutateAsync({ email: 'new@test.com', role: 'viewer' });
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/members', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'new@test.com', role: 'viewer' }),
    }));
  });

  it('removeMember calls DELETE', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, members: [{ id: '1', email: 'user@test.com' }], myRole: 'owner' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, members: [], myRole: 'owner' }),
      });

    const { result } = renderHook(() => useProjectTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeMember.mutateAsync('1');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/members/1', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('returns error on fetch failure', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'Not found' }),
    });

    const { result } = renderHook(() => useProjectTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.error).toBeTruthy();
  });
});
