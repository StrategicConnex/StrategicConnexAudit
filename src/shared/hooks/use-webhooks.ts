'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import type { WebhookEventId } from '@/shared/lib/webhook-events';

/**
 * Hook para gestionar los webhooks salientes de un proyecto.
 *
 * Contrato alineado con la API real (B7):
 *  - `POST /api/webhooks` exige `name` (antes el hook no lo enviaba → 400).
 *  - `DELETE /api/webhooks?id=&projectId=` (antes el hook llamaba a
 *    `/api/webhooks/<id>`, ruta que no existía → 404).
 *  - `POST /api/webhooks/<id>/test?projectId=` para probar la entrega.
 *  - `events` sale del catálogo (`WebhookEventId`), nunca de strings libres.
 */

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  projectId: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookTestResult {
  success: boolean;
  delivered: number;
  status: number | null;
  error?: string;
}

async function fetchWebhooks(projectId: string): Promise<Webhook[]> {
  const res = await fetch(`/api/webhooks?projectId=${projectId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch webhooks');
  return data.webhooks || [];
}

async function createWebhook(
  projectId: string,
  input: { name: string; url: string; events: WebhookEventId[] },
): Promise<Webhook> {
  const res = await fetch('/api/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...input, active: true }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to create webhook');
  return data.webhook;
}

async function deleteWebhook(id: string, projectId: string): Promise<void> {
  const res = await fetch(`/api/webhooks?id=${id}&projectId=${projectId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to delete webhook');
}

async function testWebhook(id: string, projectId: string): Promise<WebhookTestResult> {
  const res = await fetch(`/api/webhooks/${id}/test?projectId=${projectId}`, { method: 'POST' });
  const data = await res.json();
  // 502 = el destino falló: no es un error de red, es un resultado real.
  return {
    success: Boolean(data.success),
    delivered: Number(data.delivered ?? 0),
    status: data.status ?? null,
    error: data.error,
  };
}

export function useWebhooks(projectId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['webhooks', projectId],
    queryFn: () => fetchWebhooks(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; url: string; events: WebhookEventId[] }) =>
      createWebhook(projectId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to create webhook', { error: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWebhook(id, projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', projectId] });
    },
    onError: (err: Error) => {
      logger.error('Failed to delete webhook', { error: err.message });
    },
  });

  const test = useMutation({
    mutationFn: (id: string) => testWebhook(id, projectId!),
    onError: (err: Error) => {
      logger.error('Failed to test webhook', { error: err.message });
    },
  });

  return {
    webhooks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createWebhook: create,
    deleteWebhook: remove,
    testWebhook: test,
  };
}
