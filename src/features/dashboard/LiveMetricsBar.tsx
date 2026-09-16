"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Activity, Wifi, WifiOff, Clock, AlertTriangle, TrendingUp } from "lucide-react";
export type LiveMetrics = {
  connected: boolean;
  uptimePercent: number | null;
  avgLatencyMs: number | null;
  lastCheckTimestamp: string | null;
  criticalFindingsCount: number;
  highFindingsCount: number;
  eventsCount: number;
  lastEventTimestamp: string | null;
};
interface LiveMetricsBarProps {
  projectId?: string;
  investigationId?: string;
}
export function LiveMetricsBar({ projectId, investigationId }: LiveMetricsBarProps) {
  const t = useTranslations("live");
  const [metrics, setMetrics] = useState<LiveMetrics>({
    connected: false, uptimePercent: null, avgLatencyMs: null,
    lastCheckTimestamp: null, criticalFindingsCount: 0,
    highFindingsCount: 0, eventsCount: 0, lastEventTimestamp: null,
  });
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const poll = useCallback(async () => {
    // Pestaña oculta: no quemar batería/red; al volver, el intervalo retoma.
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (investigationId) params.set("investigationId", investigationId);
      const qs = params.toString();
      const url = "/api/intelligence/live" + (qs ? "?" + qs : "");
      const res = await fetch(url);
      if (!res.ok) { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); return; }
      const data = await res.json();
      if (!data.success) { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); return; }
      if (!mountedRef.current) return;
      setMetrics(p => ({ ...p, connected: true, lastCheckTimestamp: data.ts,
        uptimePercent: data.uptime.uptimePercent ?? p.uptimePercent,
        avgLatencyMs: data.uptime.avgLatencyMs ?? p.avgLatencyMs,
        criticalFindingsCount: data.findings.critical,
        highFindingsCount: data.findings.high,
        eventsCount: data.events.total,
        lastEventTimestamp: data.events.latest.length > 0 ? data.events.latest[0].created_at : p.lastEventTimestamp,
      }));
    } catch { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); }
  }, [projectId, investigationId]);
  useEffect(() => { mountedRef.current = true; poll(); intervalRef.current = setInterval(poll, 15000);
    return () => { mountedRef.current = false; if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);
  const pClass = metrics.connected ? "bg-emerald-400 animate-pulse" : "bg-red-400";
  return (
    <div className={"fixed bottom-4 right-4 mb-[env(safe-area-inset-bottom)] z-[60] transition-[width] duration-300 " + (expanded ? "w-72" : "w-auto")}
      onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden">
        {!expanded && (
          <button onClick={() => setExpanded(true)}
            aria-label={t("title")}
            className="flex items-center space-x-2 px-3 py-2 text-2xs font-mono text-muted-fg hover:text-foreground transition-colors">
            <span className={"w-2 h-2 rounded-full " + pClass} aria-hidden="true" />
            <Activity aria-hidden="true" className="w-3 h-3 text-primary" /> <span>{t("badge")}</span>
          </button>
        )}
        {expanded && (
          <div className="p-3 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={"w-2 h-2 rounded-full " + pClass} />
                <span className="text-xs font-semibold text-foreground font-mono">{t("title")}</span>
              </div>
              <div className="flex items-center space-x-1">
                {metrics.connected ? <Wifi className="w-3 h-3 text-chartreuse" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                <span className={"text-2xs font-mono " + (metrics.connected ? "text-chartreuse" : "text-red-400")}>
                  {metrics.connected ? t("online") : t("offline")}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("uptime")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <TrendingUp className="w-3 h-3 text-primary" />
                  <span className="text-xs font-bold text-foreground">{metrics.uptimePercent !== null ? Math.round(metrics.uptimePercent * 100) + "%" : "—"}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("latency")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <Clock className="w-3 h-3 text-chartreuse" />
                  <span className="text-xs font-bold text-foreground">{metrics.avgLatencyMs !== null ? metrics.avgLatencyMs + "ms" : "—"}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("critical")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                  <span className="text-xs font-bold text-foreground">{metrics.criticalFindingsCount}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("events")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <Activity className="w-3 h-3 text-blue-400" />
                  <span className="text-xs font-bold text-foreground">{metrics.eventsCount}</span>
                </div>
              </div>
            </div>
            <div className="text-2xs font-mono text-muted-fg text-center pt-1 border-t border-border/30">
              {metrics.lastCheckTimestamp ? t("updated") + new Date(metrics.lastCheckTimestamp).toLocaleTimeString() : t("waiting")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
