"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import type { FindingData } from "../hooks/useInvestigationRealtime";

interface EvidenceItem {
  id: string;
  title: string;
  severity: string;
  source?: string;
  description?: string;
  desc?: string;
  recommendation?: string | null;
}

interface EvidencesListProps {
  findings: FindingData[];
  selectedEvidenceId: string | null;
  onSelectEvidence: (id: string | null) => void;
  isDemo?: boolean;
  demoFindings?: EvidenceItem[];
}

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border border-red-500/20",
  high: "bg-red-500/10 text-red-400 border border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  low: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

export function EvidencesList({ findings, selectedEvidenceId, onSelectEvidence, isDemo, demoFindings }: EvidencesListProps) {
  const items: EvidenceItem[] = isDemo && demoFindings ? demoFindings : findings;
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-muted-fg" />
          <span className="text-xs text-muted-fg font-mono">
            {isDemo ? "Muestra de evidencias y recomendaciones (No hay auditoría activa)" : "Hallazgos de Seguridad Confirmados"}
          </span>
        </div>
        {isDemo && (
          <span className="text-[10px] bg-muted text-muted-fg border border-border px-2 py-0.5 rounded uppercase font-mono">Demo</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {isEmpty ? (
          <div className="p-12 text-center border border-dashed border-border rounded-xl text-xs text-muted-fg font-mono">
            No se han reportado hallazgos aún. Deja que el escaneo avance o ingresa un host válido.
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedEvidenceId === item.id;
            const severity = item.severity;
            return (
              <div
                key={item.id}
                onClick={() => onSelectEvidence(isSelected ? null : item.id)}
                className={`p-4 border rounded-xl cursor-pointer transition-colors duration-300 ${
                  isSelected
                    ? "bg-card border-emerald-500/40 shadow-lg"
                    : "bg-card border-border hover:border-border"
                } ${isDemo ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-foreground">{item.title}</span>
                    {item.source && (
                      <span className="font-mono text-[9px] text-muted-fg bg-muted px-1.5 py-0.5 rounded border border-border">
                        {item.source}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-mono uppercase font-semibold px-2 py-0.5 rounded ${
                    SEVERITY_CLASSES[severity] || "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}>
                    Severidad: {severity}
                  </span>
                </div>
                <p className="text-xs text-muted-fg leading-relaxed pr-2">
                  {item.description || item.desc}
                </p>
                {item.recommendation && (
                  <div className="mt-3 p-2.5 bg-background rounded-lg border border-border text-[11px] font-mono text-emerald-400/90 leading-normal">
                    <span className="text-[10px] text-muted-fg block mb-1">RECOMENDACIÓN DE REMEDIACIÓN:</span>
                    {item.recommendation}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
