'use client';

import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtimeMetrics(projectId?: string) {
  const [latestFinding, setLatestFinding] = useState<{ severity: string; title: string; createdAt: string } | null>(null);
  const [assetsDiscovered, setAssetsDiscovered] = useState<number>(0);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    let removeChannels: (() => void) | null = null;

    /**
     * H-10: import dinámico — el chunk de @supabase/supabase-js (~215 KB raw)
     * solo se necesita si hay projectId y el hook está montado; los
     * consumidores actuales llegan por chunks lazy, pero el import estático
     * es la misma puerta de regresión EAGER que tapó OverviewTab.
     */
    void (async () => {
      const { createClient } = await import('@/shared/lib/supabase/client');
      const supabase = createClient();
      if (cancelled) return;

      // Canales con nombre único por proyecto: Supabase deduplica canales por
      // nombre, y nombres estáticos provocaban que dos montajes con distinto
      // projectId compartieran el mismo topic/filter.
      const findingsChannel = supabase.channel(`metrics-findings-${projectId}`)
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
      const assetsChannel = supabase.channel(`metrics-assets-${projectId}`)
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

      removeChannels = () => {
        void supabase.removeChannel(findingsChannel);
        void supabase.removeChannel(assetsChannel);
      };
    })();

    // `supabase` deja de ser dependencia del effect (ya no existe en este scope):
    // el closure de limpieza queda instalado por el setup asíncrono.
    return () => {
      cancelled = true;
      void removeChannels?.();
    };
  }, [projectId]);

  return {
    latestFinding,
    assetsDiscovered,
  };
}
