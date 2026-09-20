'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * React Query provider — wraps the app to enable useQuery/useMutation hooks.
 * QueryClient is created per-component to avoid sharing state between
 * server-rendered trees (Next.js App Router requirement).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,       // 30s — data is fresh for 30s
            gcTime: 5 * 60_000,      // 5min — keep unused data in cache
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}
