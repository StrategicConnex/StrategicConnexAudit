"use client";

import React from "react";
import { History } from "lucide-react";
import type { RunEventData } from "../hooks/useInvestigationRealtime";

interface TimelineItem {
  id: string;
  message: string;
  eventType?: string;
  type?: string;
  tool?: string;
  time?: string;
  createdAt?: string;
}

interface TelemetryTimelineProps {
  events: RunEventData[];
  isActive: boolean;
  isDemo?: boolean;
  demoEvents?: TimelineItem[];
}

const EVENT_STYLES: Record<string, string> = {
  error: "bg-red-500/10 border-red-500/20 text-red-400",
  success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  warning: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  info: "bg-card border-border text-muted-fg",
};

export function TelemetryTimeline({ events, isActive, isDemo, demoEvents }: TelemetryTimelineProps) {
  const items: TimelineItem[] = isDemo && demoEvents ? demoEvents : events;
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-muted-fg" />
          <span className="text-xs text-muted-fg font-mono">
            {isDemo ? "Ejemplo de Telemetría (No hay auditoría activa)" : "Eventos en Tiempo Real"}
          </span>
        </div>
        {isDemo && (
          <span className="text-[10px] bg-muted text-muted-fg border border-border px-2 py-0.5 rounded uppercase font-mono">Demo</span>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-[#1f1f23]">
        {isEmpty && isActive ? (
          <div className="p-8 text-center text-xs text-muted-fg font-mono">
            Iniciando conexión con Supabase Realtime... Esperando el primer reporte de los escáneres perimetrales.
          </div>
        ) : (
          items.map((item) => {
            const eventType = item.eventType || item.type || 'info';
            const eventClass = EVENT_STYLES[eventType] || EVENT_STYLES.info;
            const timestamp = item.createdAt
              ? new Date(item.createdAt).toLocaleTimeString()
              : item.time || "";
            const tool = item.tool || "";

            return (
              <div key={item.id} className="p-3.5 flex items-start space-x-3 text-xs hover:bg-muted/50 transition-colors">
                {tool && (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-card border border-border text-muted-fg">
                    {tool}
                  </span>
                )}
                {!tool && (
                  <span className={`font-mono text-[9px] px-2 py-0.5 rounded border ${eventClass}`}>
                    {eventType.toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground leading-relaxed pr-4 font-mono">{item.message}</p>
                  {timestamp && (
                    <span className="text-[10px] text-muted-fg mt-1 block">{timestamp}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
