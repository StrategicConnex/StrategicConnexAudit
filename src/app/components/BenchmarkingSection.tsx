"use client";

import { useState, useEffect } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, ShieldCheck,
  Zap, Loader2, AlertCircle
} from "lucide-react";

interface BenchmarkStats {
  min: number; max: number; avg: number; median: number;
  p25: number; p75: number; p95: number; count: number;
}

interface YourMetrics {
  projectId: string;
  uptimePercent: number;
  avgLatencyMs: number;
  score: number | null;
}

interface YourPercentile {
  uptime: number | null;
  latency: number | null;
  score: number | null;
}

interface BenchmarkingData {
  benchmarks: {
    uptime: BenchmarkStats;
    latency: BenchmarkStats;
    healthScore: BenchmarkStats;
    totalProjects: number;
    computedAt: string;
  };
  yourMetrics: YourMetrics | null;
  yourPercentile: YourPercentile;
}

function getRank(value: number | null, pct: number | null): { label: string; rank: 'top' | 'above' | 'below' | 'bottom'; color: string } {
  if (value === null || pct === null) return { label: "N/A", rank: "below", color: "text-muted-fg" };
  if (pct <= 25) return { label: "Top " + pct + "%", rank: "top", color: "text-chartreuse" };
  if (pct <= 50) return { label: "Sobre mediana", rank: "above", color: "text-primary" };
  if (pct <= 75) return { label: "Debajo media", rank: "below", color: "text-amber-400" };
  return { label: "Bottom " + (100 - pct) + "%", rank: "bottom", color: "text-destructive" };
}

export function BenchmarkingSection({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<BenchmarkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = projectId ? "?projectId=" + projectId : "";
    fetch("/api/benchmarking" + params)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d);
        } else {
          setError(d.error || "Error al cargar benchmarks");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-center justify-center gap-3 min-h-[200px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm text-muted-fg">Calculando benchmarks...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-center justify-center gap-3 min-h-[200px]">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <span className="text-sm text-muted-fg">{error || "Sin datos de benchmarking"}</span>
      </div>
    );
  }

  const { benchmarks, yourMetrics, yourPercentile } = data;
  const uptimeRank = getRank(yourMetrics?.uptimePercent ?? null, yourPercentile.uptime);
  const latencyRank = getRank(yourMetrics?.avgLatencyMs != null && yourMetrics.avgLatencyMs > 0 ? yourMetrics.avgLatencyMs : null, yourPercentile.latency);
  const scoreRank = getRank(yourMetrics?.score ?? null, yourPercentile.score);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            Industry Benchmarking
          </h3>
          <p className="text-sm font-bold text-foreground tracking-tight font-display">
            Tu desempeno vs {benchmarks.totalProjects} proyecto{benchmarks.totalProjects !== 1 ? "s" : ""} activos
          </p>
        </div>
        <span className="text-[9px] font-mono text-muted-fg">
          {new Date(benchmarks.computedAt).toLocaleString()}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Uptime */}
        <div className="rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary" /> Uptime
            </span>
            {yourMetrics && (
              <span className={"text-[9px] font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (uptimeRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : uptimeRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : uptimeRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {uptimeRank.rank === "top" || uptimeRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {uptimeRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] text-muted-fg">Tu proyecto</p>
              <p className="text-lg font-extrabold text-foreground font-display">
                {yourMetrics ? yourMetrics.uptimePercent + "%" : "--"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-fg">Mediana industria</p>
              <p className="text-lg font-extrabold text-foreground/70 font-display">
                {benchmarks.uptime.median}%
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-[9px] text-muted-fg">
              <span>P25: {benchmarks.uptime.p25}%</span>
              <span>P75: {benchmarks.uptime.p75}%</span>
              <span>P95: {benchmarks.uptime.p95}%</span>
            </div>
          </div>
        </div>

        {/* Latency */}
        <div className="rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-primary" /> Latencia
            </span>
            {yourMetrics && (
              <span className={"text-[9px] font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (latencyRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : latencyRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : latencyRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {latencyRank.rank === "top" || latencyRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {latencyRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] text-muted-fg">Tu proyecto</p>
              <p className="text-lg font-extrabold text-foreground font-display">
                {yourMetrics?.avgLatencyMs ? yourMetrics.avgLatencyMs + "ms" : "--"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-fg">Mediana industria</p>
              <p className="text-lg font-extrabold text-foreground/70 font-display">
                {benchmarks.latency.median}ms
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-[9px] text-muted-fg">
              <span>P25: {benchmarks.latency.p25}ms</span>
              <span>P75: {benchmarks.latency.p75}ms</span>
              <span>P95: {benchmarks.latency.p95}ms</span>
            </div>
          </div>
        </div>

        {/* Health Score */}
        <div className="rounded-xl p-4 border transition-all duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-primary" /> Health Score
            </span>
            {yourMetrics && (
              <span className={"text-[9px] font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (scoreRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : scoreRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : scoreRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {scoreRank.rank === "top" || scoreRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {scoreRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] text-muted-fg">Tu proyecto</p>
              <p className="text-lg font-extrabold text-foreground font-display">
                {yourMetrics?.score != null ? yourMetrics.score + "/100" : "--"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-fg">Mediana industria</p>
              <p className="text-lg font-extrabold text-foreground/70 font-display">
                {benchmarks.healthScore.median}/100
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-[9px] text-muted-fg">
              <span>P25: {benchmarks.healthScore.p25}</span>
              <span>P75: {benchmarks.healthScore.p75}</span>
              <span>P95: {benchmarks.healthScore.p95}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary footer */}
      <p className="text-[10px] text-muted-fg/60 text-center pt-2">
        Basado en {benchmarks.uptime.count} proyectos con datos de uptime, {benchmarks.latency.count} con latencia y {benchmarks.healthScore.count} con health scores.
        Los percentiles se calculan sobre los ultimos 30 dias.
      </p>
    </div>
  );
}
