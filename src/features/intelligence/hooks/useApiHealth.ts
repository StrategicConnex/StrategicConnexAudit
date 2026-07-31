"use client";

import { useState, useEffect, useCallback } from "react";

export interface ApiHealthState {
  globalStatus: string;
  summary: { total: number; healthy: number; degraded: number; down: number };
  lastChecked: string;
}

export interface ApiHealthReturn {
  health: ApiHealthState | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useApiHealth(): ApiHealthReturn {
  const [health, setHealth] = useState<ApiHealthState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence/health");
      const data = await res.json();
      if (data.success) {
        setHealth({
          globalStatus: data.globalStatus,
          summary: data.summary || { total: 4, healthy: 4, degraded: 0, down: 0 },
          lastChecked: data.timestamp,
        });
      }
    } catch {
      // Silently fail — health check is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { health, loading, refresh: fetchHealth };
}
