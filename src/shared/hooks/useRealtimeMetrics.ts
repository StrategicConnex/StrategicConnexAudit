'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtimeMetrics(projectId?: string) {
  const [latestFinding, setLatestFinding] = useState<{ severity: string; title: string; createdAt: string } | null>(null);
  const [assetsDiscovered, setAssetsDiscovered] = useState<number>(0);
  // CS-301 fix: usar el nombre canónico (PUBLISHABLE_KEY); env.ts mantiene el
  // alias de compatibilidad ANON_KEY para no romper despliegues existentes.
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    if (!projectId) return;

    // Listen to new findings
    const findingsChannel = supabase.channel('custom-findings-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intelligence_findings', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as { severity: string; title: string; created_at: string };
          setLatestFinding({
            severity: row.severity,
            title: row.title,
            createdAt: row.created_at,
          });
        }
      )
      .subscribe();

    // Listen to new assets
    const assetsChannel = supabase.channel('custom-assets-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intelligence_assets', filter: `project_id=eq.${projectId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          void payload;
          setAssetsDiscovered((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(findingsChannel);
      supabase.removeChannel(assetsChannel);
    };
  }, [projectId, supabase]);

  return {
    latestFinding,
    assetsDiscovered,
  };
}
