'use client';

import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/shared/lib/supabase/client';

export function useRealtimeMetrics(projectId?: string) {
  const [latestFinding, setLatestFinding] = useState<{ severity: string; title: string; createdAt: string } | null>(null);
  const [assetsDiscovered, setAssetsDiscovered] = useState<number>(0);
  // Singleton estándar (createBrowserClient ya es singleton internamente):
  // evita duplicar la lectura cruda de env y el fallback || "".
  const supabase = createClient();

  useEffect(() => {
    if (!projectId) return;

    // Listen to new findings
    const findingsChannel = supabase.channel('custom-findings-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'intelligence_findings', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as { project_id?: string; severity: string; title: string; created_at: string };
          // Aislamiento multi-tenant: el filtro del servidor (project_id=eq.X) ya
          // restringe, pero RLS/Realtime pueden fallar abierto — verificar aquí es
          // la última línea de defensa (CHANGE-003). Ignorar filas de otros tenants.
          if (row.project_id && row.project_id !== projectId) return;
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
          const row = payload.new as { project_id?: string };
          // Aislamiento multi-tenant (CHANGE-003): ignorar activos de otros tenants.
          if (row.project_id && row.project_id !== projectId) return;
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
