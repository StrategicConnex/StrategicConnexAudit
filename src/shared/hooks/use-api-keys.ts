'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

export interface ApiKey {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch('/api/api-keys');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch API keys');
  return data.apiKeys || [];
}

async function createApiKey(name: string): Promise<ApiKey> {
  const res = await fetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to create API key');
  return data.apiKey;
}

async function deleteApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to delete API key');
}

/**
 * Hook for fetching and managing API keys.
 */
export function useApiKeys() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['api-keys'],
    queryFn: fetchApiKeys,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: Error) => {
      logger.error('Failed to create API key', { error: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: Error) => {
      logger.error('Failed to delete API key', { error: err.message });
    },
  });

  return {
    apiKeys: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createApiKey: create,
    deleteApiKey: remove,
  };
}
