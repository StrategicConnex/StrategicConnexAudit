"use client";

import React from "react";
import { ShieldCheck, Activity, TrendingUp, Loader2 } from "lucide-react";
import type { InvestigationData } from "../hooks/useInvestigationRealtime";

interface QuickMetricsHudProps {
  investigation: InvestigationData | null;
}

export function QuickMetricsHud({ investigation }: QuickMetricsHudProps) {
  const isRunning = investigation?.status === "running" || investigation?.status === "queued";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 flex items-center space-x-3.5">
        <div className="w-10 h-10 rounded-lg bg-chartreuse/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-chartreuse" />
        </div>
        <div>
          <span className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">Firewall Status</span>
          <h4 className="text-sm font-semibold text-foreground mt-0.5">EgressGuard Activo</h4>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-center space-x-3.5">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <span className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">Métricas Escaneadas</span>
          <h4 className="text-sm font-semibold text-foreground mt-0.5">16 Herramientas Core</h4>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-center space-x-3.5">
        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
          {isRunning ? (
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          ) : (
            <TrendingUp className="w-5 h-5 text-purple-400" />
          )}
        </div>
        <div>
          <span className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">Estado Auditoría</span>
          <h4 className="text-sm font-semibold text-foreground mt-0.5">
            {investigation
              ? investigation.status === "running"
                ? "Ejecutando escaneo..."
                : investigation.status === "completed"
                ? `Completado (Postura: ${investigation.score}/100)`
                : investigation.status === "failed"
                ? "Escaneo Fallido"
                : "Inicializado"
              : "Esperando Objetivo"}
          </h4>
        </div>
      </div>
    </div>
  );
}
