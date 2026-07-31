"use client";

import { useMemo } from "react";
import type { FindingData } from "./useInvestigationRealtime";

export type MailStatus = "secure" | "warning" | "missing" | "pending";

export interface MailHealthStatus {
  spf: MailStatus;
  dmarc: MailStatus;
  dkim: MailStatus;
  bimi: MailStatus;
}

export interface MailHealthStatusConfig {
  bg: string;
  border?: string;
  label: string;
  subText: string;
  ring: string;
}

export const MAIL_HEALTH_STYLES: Record<MailStatus, MailHealthStatusConfig> = {
  secure: { bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "Óptimo", subText: "Configuración Correcta", ring: "ring-emerald-500/30" },
  warning: { bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", label: "Aviso", subText: "Configuración Insegura", ring: "ring-amber-500/30" },
  missing: { bg: "bg-red-500/10 border-red-500/20 text-red-400", label: "Crítico", subText: "Falta Protocolo", ring: "ring-red-500/30" },
  pending: { bg: "bg-muted border-border text-muted-fg", label: "Pendiente", subText: "Esperando Escaneo", ring: "ring-zinc-700/30" },
};

function deriveStatus(
  findings: FindingData[],
  hasActiveInvestigation: boolean,
  keywordPositive: string[],
  keywordNegative: string[],
  keywordAny: string[]
): MailStatus {
  if (!hasActiveInvestigation) return "pending";
  const hasNegative = findings.some((f) =>
    keywordNegative.some((k) => f.title.toLowerCase().includes(k))
  );
  if (hasNegative) return "missing";
  const hasPositive = findings.some((f) =>
    keywordPositive.some((k) => f.title.toLowerCase().includes(k))
  );
  if (hasPositive) return "secure";
  const hasAny = findings.some((f) =>
    keywordAny.some((k) => f.title.toLowerCase().includes(k) || f.description.toLowerCase().includes(k))
  );
  if (hasAny) return "warning";
  return "pending";
}

export function useMailHealthStatus(
  findings: FindingData[],
  activeInvestigationId: string | null
): MailHealthStatus {
  return useMemo(() => {
    const hasActive = !!activeInvestigationId;

    return {
      spf: deriveStatus(
        findings, hasActive,
        ["spf"],
        ["spf inexistente", "sin registro spf", "falta registro de protección de correo spf"],
        ["spf crítica", "spf insegura", "mecanismo overlimit"]
      ),
      dmarc: deriveStatus(
        findings, hasActive,
        ["dmarc p=reject", "dmarc p=quarantine"],
        ["ausencia", "inexistente", "sin registro dmarc", "falta registro de alineación"],
        ["dmarc p=none", "dmarc modo monitoreo"]
      ),
      dkim: deriveStatus(
        findings, hasActive,
        ["dkim"],
        ["ausencia", "inexistente", "falta"],
        ["dkim"]
      ),
      bimi: deriveStatus(
        findings, hasActive,
        ["bimi"],
        ["ausencia", "inexistente", "falta"],
        ["bimi"]
      ),
    };
  }, [findings, activeInvestigationId]);
}
