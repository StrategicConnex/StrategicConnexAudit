'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

interface Member {
  id: string;
  userId?: string;
  email: string;
  fullName?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'guest';
  createdAt: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

interface TeamData {
  members: Member[];
  invitations: Invitation[];
  myRole: string | null;
}

async function fetchProjectTeam(projectId: string): Promise<TeamData> {
  const res = await fetch(`/api/projects/${projectId}/members`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch team');
  return {
    members: data.members ?? [],
    invitations: data.invitations ?? [],
    myRole: data.myRole ?? null,
  };
}

async function inviteMember(
  projectId: string,
  email: string,
  role: string,
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to invite member');
}

async function removeMember(projectId: string, memberId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to remove member');
}

/**
 * Hook for fetching and managing project team members.
 */
export function useProjectTeam(projectId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['project-team', projectId],
    queryFn: () => fetchProjectTeam(projectId),
    staleTime: 30_000,
  });

  const invite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      inviteMember(projectId, email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to invite team member', { error: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-team', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to remove team member', { error: err.message });
    },
  });

  return {
    members: query.data?.members ?? [],
    invitations: query.data?.invitations ?? [],
    myRole: query.data?.myRole ?? null,
    isLoading: query.isLoading,
    error: query.error,
    inviteMember: invite,
    removeMember: remove,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['project-team', projectId] }),
  };
}
