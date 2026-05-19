import { useEffect, useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";

export interface InvestigationData {
  id: string;
  title: string;
  target: string;
  normalizedTarget: string;
  status: "draft" | "queued" | "running" | "completed" | "failed" | "canceled";
  score: number | null;
  summary: string | null;
  metadata: any;
  createdAt: string;
}

export interface FindingData {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommendation: string | null;
  evidence: any;
  affectedAsset: string | null;
  createdAt: string;
}

export interface RunEventData {
  id: string;
  eventType: string;
  message: string;
  payload: any;
  createdAt: string;
}

export function useInvestigationRealtime(investigationId: string | null) {
  const [investigation, setInvestigation] = useState<InvestigationData | null>(null);
  const [findings, setFindings] = useState<FindingData[]>([]);
  const [events, setEvents] = useState<RunEventData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  const fetchInitialData = async (id: string) => {
    try {
      const res = await fetch(`/api/intelligence/investigations?investigationId=${id}`);
      const data = await res.json();
      if (data.success) {
        setInvestigation(data.investigation);
        setFindings(data.findings || []);
        // Events sorted by createdAt descending
        setEvents(data.events || []);
      } else {
        setError(data.error || "Error al obtener detalles de la investigación");
      }
    } catch (err: any) {
      setError(err.message || "Error al conectar con la base de datos");
    }
  };

  useEffect(() => {
    if (!investigationId) {
      setInvestigation(null);
      setFindings([]);
      setEvents([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    fetchInitialData(investigationId).finally(() => {
      setIsLoading(false);
    });

    // Supabase Realtime Client initialization
    const supabase = createClient();
    
    // Subscribe to events, findings, and investigations changes
    const channel = supabase
      .channel(`investigation_realtime:${investigationId}`)
      // Listen to new events
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intelligence_run_events",
          filter: `investigation_id=eq.${investigationId}`
        },
        (payload) => {
          setEvents((prev) => {
            if (prev.some((e) => e.id === payload.new.id)) return prev;
            return [payload.new as RunEventData, ...prev];
          });
        }
      )
      // Listen to new findings
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intelligence_findings",
          filter: `investigation_id=eq.${investigationId}`
        },
        (payload) => {
          setFindings((prev) => {
            if (prev.some((f) => f.id === payload.new.id)) return prev;
            return [payload.new as FindingData, ...prev];
          });
        }
      )
      // Listen to investigation updates
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "intelligence_investigations",
          filter: `id=eq.${investigationId}`
        },
        (payload) => {
          setInvestigation(payload.new as InvestigationData);
        }
      )
      .subscribe();

    // Short-polling fallback: poll every 3 seconds if status is running/queued
    let pollInterval: NodeJS.Timeout;
    
    const checkStatusAndPoll = () => {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/intelligence/investigations?investigationId=${investigationId}`);
          const data = await res.json();
          if (data.success) {
            setInvestigation(data.investigation);
            setFindings(data.findings || []);
            setEvents(data.events || []);

            // Stop polling when investigation finishes
            if (data.investigation?.status !== "running" && data.investigation?.status !== "queued") {
              clearInterval(pollInterval);
            }
          }
        } catch (pollErr) {
          console.error("Polling error in fallback:", pollErr);
        }
      }, 3000);
    };

    checkStatusAndPoll();

    return () => {
      void supabase.removeChannel(channel);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [investigationId]);

  return {
    investigation,
    findings,
    events,
    isLoading,
    error,
    refetch: () => investigationId && fetchInitialData(investigationId)
  };
}
