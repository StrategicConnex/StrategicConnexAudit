"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, ShieldCheck,
  Zap, Loader2, AlertCircle, Radar, LockKeyhole, RotateCcw
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar as RechartsRadar, ResponsiveContainer, Tooltip
} from "recharts";

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

type TFn = (key: string, values?: Record<string, string | number>) => string;

function getRank(t: TFn, value: number | null, pct: number | null) {
  if (value === null || pct === null) return { label: t("rankNA"), rank: "below", color: "text-muted-fg" };
  if (pct <= 25) return { label: t("rankTop", { pct }), rank: "top", color: "text-chartreuse" };
  if (pct <= 50) return { label: t("rankAbove"), rank: "above", color: "text-primary" };
  if (pct <= 75) return { label: t("rankBelow"), rank: "below", color: "text-amber-400" };
  return { label: t("rankBottom", { pct: 100 - pct }), rank: "bottom", color: "text-destructive" };
}

export function BenchmarkingSection({ projectId }: { projectId?: string }) {
  const t = useTranslations("benchmarking");
  const [data, setData] = useState<BenchmarkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    const params = projectId ? "?projectId=" + projectId : "";
    fetch("/api/benchmarking" + params)
      .then(async (r) => {
        // Sin sesión no hay benchmarks: estado honesto, no error crudo.
        if (r.status === 401) {
          setUnauthorized(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.success) setData(d);
        else setError(d.error || "Error al cargar benchmarks");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error de conexión"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const radarData = useMemo(() => {
    if (!data?.benchmarks) return [];
    const { benchmarks, yourMetrics } = data;
    const maxU = benchmarks.uptime.max || 100;
    const maxL = benchmarks.latency.p95 || 5000;
    const maxS = benchmarks.healthScore.max || 100;

    return [
      {
        dimension: "Uptime",
        Tu: yourMetrics ? Math.round((yourMetrics.uptimePercent / maxU) * 100) : 0,
        Industria: Math.round((benchmarks.uptime.median / maxU) * 100),
      },
      {
        dimension: "Latencia",
        Tu: yourMetrics?.avgLatencyMs ? Math.round((1 - yourMetrics.avgLatencyMs / maxL) * 100) : 0,
        Industria: Math.round((1 - benchmarks.latency.median / maxL) * 100),
      },
      {
        dimension: "Health",
        Tu: yourMetrics?.score != null ? Math.round((yourMetrics.score / maxS) * 100) : 0,
        Industria: Math.round((benchmarks.healthScore.median / maxS) * 100),
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 flex items-center justify-center gap-3 min-h-[200px]" aria-busy="true">
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        <span className="text-sm text-muted-fg">{t("loading")}</span>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center">
        <LockKeyhole aria-hidden="true" className="w-5 h-5 text-muted-fg" />
        <p className="text-sm font-bold text-foreground">{t("lockedTitle")}</p>
        <p className="text-xs text-muted-fg max-w-sm">{t("lockedDesc")}</p>
        <Link
          href="/login"
          className="mt-1 text-2xs font-bold uppercase tracking-widest text-primary transition-colors inline-flex items-center gap-1.5 px-4 py-2 rounded-md border"
          style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}
        >
          {t("login")}
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center">
        <AlertCircle aria-hidden="true" className="w-5 h-5 text-destructive" />
        <span className="text-sm text-muted-fg">{error || t("noData")}</span>
        <button
          onClick={load}
          className="mt-1 text-2xs font-bold uppercase tracking-widest text-muted-fg hover:text-primary transition-colors inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border cursor-pointer"
        >
          <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
          {t("retry")}
        </button>
      </div>
    );
  }

  // Sin industria contra la que comparar: percentiles de la nada son humo.
  if (data.benchmarks.totalProjects === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 min-h-[200px]">
        <EmptyState
          icon={<BarChart3 aria-hidden="true" className="w-8 h-8" />}
          title={t("noIndustryTitle")}
          description={t("noIndustryDesc")}
        />
      </div>
    );
  }

  const { benchmarks, yourMetrics, yourPercentile } = data;
  const uptimeRank = getRank(t, yourMetrics?.uptimePercent ?? null, yourPercentile.uptime);
  const latencyRank = getRank(t, yourMetrics?.avgLatencyMs ?? null, yourPercentile.latency);
  const scoreRank = getRank(t, yourMetrics?.score ?? null, yourPercentile.score);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            {t("title")}
          </h3>
          <p className="text-sm font-bold text-foreground tracking-tight font-display">
            {t("yourVs", { count: benchmarks.totalProjects, plural: benchmarks.totalProjects !== 1 ? "s" : "" })}
          </p>
        </div>
        <span className="text-2xs font-mono text-muted-fg">{new Date(benchmarks.computedAt).toLocaleString()}</span>
      </div>

      {/* 3 metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Uptime */}
        <div className="rounded-xl p-4 border transition-[border-color,transform] duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary" /> {t("uptime")}
            </span>
            {yourMetrics && (
              <span className={"text-2xs font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (uptimeRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : uptimeRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : uptimeRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {uptimeRank.rank === "top" || uptimeRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {uptimeRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-2xs text-muted-fg">{t("yourProject")}</p><p className="text-lg font-extrabold text-foreground font-display">{yourMetrics ? yourMetrics.uptimePercent + "%" : "--"}</p></div>
            <div><p className="text-2xs text-muted-fg">{t("industryMedian")}</p><p className="text-lg font-extrabold text-foreground/70 font-display">{benchmarks.uptime.median}%</p></div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-2xs text-muted-fg">
              <span>P25: {benchmarks.uptime.p25}%</span><span>P75: {benchmarks.uptime.p75}%</span><span>P95: {benchmarks.uptime.p95}%</span>
            </div>
          </div>
        </div>

        {/* Latency */}
        <div className="rounded-xl p-4 border transition-[border-color,transform] duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-primary" /> {t("latency")}
            </span>
            {yourMetrics && (
              <span className={"text-2xs font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (latencyRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : latencyRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : latencyRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {latencyRank.rank === "top" || latencyRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {latencyRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-2xs text-muted-fg">{t("yourProject")}</p><p className="text-lg font-extrabold text-foreground font-display">{yourMetrics?.avgLatencyMs ? yourMetrics.avgLatencyMs + "ms" : "--"}</p></div>
            <div><p className="text-2xs text-muted-fg">{t("industryMedian")}</p><p className="text-lg font-extrabold text-foreground/70 font-display">{benchmarks.latency.median}ms</p></div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-2xs text-muted-fg">
              <span>P25: {benchmarks.latency.p25}ms</span><span>P75: {benchmarks.latency.p75}ms</span><span>P95: {benchmarks.latency.p95}ms</span>
            </div>
          </div>
        </div>

        {/* Health Score */}
        <div className="rounded-xl p-4 border transition-[border-color,transform] duration-300 hover:scale-[1.02]"
          style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-primary" /> {t("healthScore")}
            </span>
            {yourMetrics && (
              <span className={"text-2xs font-extrabold px-2 py-0.5 rounded-full border flex items-center gap-1 " + (scoreRank.rank === "top" ? "text-chartreuse bg-chartreuse/10 border-chartreuse/20" : scoreRank.rank === "above" ? "text-primary bg-primary/10 border-primary/20" : scoreRank.rank === "below" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-destructive bg-destructive/10 border-destructive/20")}>
                {scoreRank.rank === "top" || scoreRank.rank === "above" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {scoreRank.label}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-2xs text-muted-fg">{t("yourProject")}</p><p className="text-lg font-extrabold text-foreground font-display">{yourMetrics?.score != null ? yourMetrics.score + "/100" : "--"}</p></div>
            <div><p className="text-2xs text-muted-fg">{t("industryMedian")}</p><p className="text-lg font-extrabold text-foreground/70 font-display">{benchmarks.healthScore.median}/100</p></div>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "oklch(15% 0.008 265 / 0.15)" }}>
            <div className="flex justify-between text-2xs text-muted-fg">
              <span>P25: {benchmarks.healthScore.p25}</span><span>P75: {benchmarks.healthScore.p75}</span><span>P95: {benchmarks.healthScore.p95}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      {radarData.length > 0 && (
        <div className="rounded-xl border p-5" style={{ background: "oklch(100% 0 0 / 0.02)", borderColor: "oklch(15% 0.008 265 / 0.3)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Radar className="w-4 h-4 text-primary" />
            <h4 className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{t("radar")}</h4>
          </div>
          <div className="w-full" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="oklch(100% 0 0 / 0.06)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: "oklch(60% 0.01 265)", fontSize: 10, fontWeight: 700 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "oklch(40% 0.01 265)", fontSize: 8 }} tickCount={5} />
                <RechartsRadar name={t("industry")} dataKey="Industria" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.08} strokeWidth={1.5} dot={{ fill: "var(--accent)", r: 2 }} />
                <RechartsRadar name={t("yourProject")} dataKey="Tu" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2} dot={{ fill: "var(--primary)", r: 3 }} />
                <Tooltip contentStyle={{ background: "oklch(8% 0.005 265)", border: "1px solid oklch(15% 0.008 265 / 0.3)", borderRadius: 8, fontSize: 11, color: "oklch(85% 0 0)" }} formatter={(value) => [String(value) + '/100', 'Puntaje']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--accent)" }} /> {t("industry")}
            </span>
            <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--primary)" }} /> {t("yourProject")}
            </span>
          </div>
        </div>
      )}

      <p className="text-2xs text-muted-fg/60 text-center pt-2">
        {t("basedOn", { uptime: benchmarks.uptime.count, latency: benchmarks.latency.count, health: benchmarks.healthScore.count })}
      </p>
    </div>
  );
}
