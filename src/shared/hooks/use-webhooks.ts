'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  projectId: string;
  active: boolean;
  createdAt: string;
}

async function fetchWebhooks(projectId: string): Promise<Webhook[]> {
  const res = await fetch(`/api/webhooks?projectId=${projectId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch webhooks');
  return data.webhooks || [];
}

async function createWebhook(projectId: string, url: string, events: string[]): Promise<Webhook> {
  const res = await fetch('/api/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, url, events }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to create webhook');
  return data.webhook;
}

async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to delete webhook');
}

/**
 * Hook for fetching and managing webhooks for a project.
 */
export function useWebhooks(projectId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['webhooks', projectId],
    queryFn: () => fetchWebhooks(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: ({ url, events }: { url: string; events: string[] }) =>
      createWebhook(projectId!, url, events),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to create webhook', { error: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to delete webhook', { error: err.message });
    },
  });

  return {
    webhooks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createWebhook: create,
    deleteWebhook: remove,
  };
}
