'use client';

import { useQuery } from '@tanstack/react-query';

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  joinedAt: string;
}

async function fetchTeam(): Promise<TeamMember[]> {
  const res = await fetch('/api/team');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch team');
  return data.members || [];
}

/**
 * Hook for fetching team members.
 */
export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: fetchTeam,
    staleTime: 60_000,
  });
}
