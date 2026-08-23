import { useEffect, useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { getErrorMessage } from "@/shared/lib/errors";
import type {
  IntelligenceFinding,
  IntelligenceInvestigation,
  IntelligenceRunEvent,
} from "@/shared/db/schemas";

/**
 * Tipos derivados del schema canónico (única fuente de verdad) en lugar de
 * interfaces locales duplicadas con campos `any`. Los payloads Realtime y las
 * respuestas API viajan como JSON: los timestamps llegan como string ISO.
 */
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type InvestigationData = Serialized<
  Pick<
    IntelligenceInvestigation,
    "id" | "title" | "target" | "normalizedTarget" | "status" | "score" | "summary" | "metadata" | "createdAt"
  >
>;

export type FindingData = Serialized<
  Pick<
    IntelligenceFinding,
    "id" | "severity" | "title" | "description" | "recommendation" | "evidence" | "affectedAsset" | "createdAt"
  >
>;

export type RunEventData = Serialized<
  Pick<IntelligenceRunEvent, "id" | "eventType" | "message" | "payload" | "createdAt">
>;

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
    } catch (err: unknown) {
      const raw = getErrorMessage(err);
      setError(raw === "Error desconocido" ? "Error al conectar con la base de datos" : raw);
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
          const row = payload.new as { investigation_id?: string; id?: string };
          // Aislamiento multi-tenant (CHANGE-003): los eventos llevan
          // investigation_id; ignorar los de otras investigaciones/tenants.
          if (row.investigation_id && row.investigation_id !== investigationId) return;
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
          const row = payload.new as { investigation_id?: string; id?: string };
          // Aislamiento multi-tenant (CHANGE-003): ignorar findings de otras
          // investigaciones/tenants.
          if (row.investigation_id && row.investigation_id !== investigationId) return;
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
          const row = payload.new as { id?: string };
          // Aislamiento multi-tenant (CHANGE-003): las actualizaciones de la
          // investigación llevan id; ignorar las de otras investigaciones.
          if (row.id && row.id !== investigationId) return;
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
