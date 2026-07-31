"use client";

import React from "react";

interface ApiHealthBadgeProps {
  health: { globalStatus: string; summary: { total: number; healthy: number; degraded: number; down: number } } | null;
  loading: boolean;
  onRefresh: () => void;
}

const COLORS: Record<string, string> = {
  healthy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  degraded: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  down: "text-red-400 bg-red-500/10 border-red-500/20",
};

const LABELS: Record<string, string> = {
  healthy: "Sistema Saludable",
  degraded: "Degradado",
  down: "Caído",
};

const DOT_COLORS: Record<string, string> = {
  healthy: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-red-400",
};

export function ApiHealthBadge({ health, loading, onRefresh }: ApiHealthBadgeProps) {
  if (loading && !health) {
    return (
      <div className="hidden sm:flex items-center px-2.5 py-1.5 rounded-lg border border-border bg-card/50">
        <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  if (!health) return null;

  const status = health.globalStatus;
  const colorClass = COLORS[status] || "text-muted-fg bg-muted/50 border-border";
  const dotClass = DOT_COLORS[status] || "bg-muted";

  return (
    <button
      onClick={onRefresh}
      className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono transition-all group ${colorClass}`}
      title={`${LABELS[status] || "Desconocido"} — ${health.summary.healthy}/${health.summary.total} servicios operativos. Click para refrescar.`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass} animate-pulse`} />
      <span>
        {status === "healthy"
          ? "APIs OK"
          : status === "degraded"
          ? `${health.summary.degraded + health.summary.down} APIs Caídas`
          : "APIs Caídas"}
      </span>
    </button>
  );
}
