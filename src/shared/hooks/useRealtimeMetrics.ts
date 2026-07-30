'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export function useRealtimeMetrics(projectId?: string) {
  const [latestFinding, setLatestFinding] = useState<{ severity: string; title: string; createdAt: string } | null>(null);
  const [assetsDiscovered, setAssetsDiscovered] = useState<number>(0);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    if (!projectId) return;

    // Listen to new findings
    const findingsChannel = supabase.channel('custom-findings-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intelligence_findings', filter: `project_id=eq.${projectId}` },
        (payload: any) => {
          setLatestFinding({
            severity: payload.new.severity,
            title: payload.new.title,
            createdAt: payload.new.created_at,
          });
        }
      )
      .subscribe();

    // Listen to new assets
    const assetsChannel = supabase.channel('custom-assets-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intelligence_assets', filter: `project_id=eq.${projectId}` },
        (payload: any) => {
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
