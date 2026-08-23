import { useState } from "react";
import { useIntelligenceStore, IntelligenceState } from "../stores/intelligence-store";
import { getErrorMessage } from "@/shared/lib/errors";

interface CreateInvestigationInput {
  projectId: string;
  target: string;
  template?: "auto" | "domain" | "email" | "ip" | "website" | "attack_surface";
  tools?: string[];
}

export function useCreateInvestigation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setActiveInvestigation = useIntelligenceStore((s: IntelligenceState) => s.setActiveInvestigation);

  const createInvestigation = async (input: CreateInvestigationInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/intelligence/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Error al crear la investigación");
      }

      if (data.investigation?.id) {
        setActiveInvestigation(data.investigation.id);
      }
      return data.investigation;
    } catch (err: unknown) {
      const raw = getErrorMessage(err);
      const msg = raw === "Error desconocido" ? "Error de conexión" : raw;
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { createInvestigation, isLoading, error };
}
