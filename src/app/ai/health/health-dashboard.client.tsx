"use client";

import { useState, useMemo, Fragment } from "react";
import { PushSubscribeButton } from "@/components/PushSubscribeButton";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from "recharts";
import type { HealthCheckRecord, DailyAggregate, ModelHealthSummary } from "./actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  recent: HealthCheckRecord[];
  daily: DailyAggregate[];
  models: ModelHealthSummary[];
  latest: HealthCheckRecord | null;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  unhealthy: "#ef4444",
  grid: "rgba(255,255,255,0.04)",
  text: "rgba(255,255,255,0.4)",
};

const MODEL_COLORS = [
  "#06b6d4", "#22c55e", "#a855f7", "#f59e0b",
  "#ef4444", "#3b82f6", "#ec4899", "#84cc16",
];

const CHART_COMMON = { width: "100%" as const, height: "100%" as const };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "justo ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function shortModelId(id: string): string {
  return id
    .replace("nvidia/", "")
    .replace("google/", "")
    .replace(":free", "")
    .replace("-a4b-it", "")
    .replace("-30b-a3b-reasoning", "")
    .replace("-120b-a12b", "")
    .replace("-550b-a55b", "")
    .replace("-30b-a3b", "")
    .replace("openrouter/", "");
}

// ─── Card Component ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 group hover:bg-white/[0.035] transition-all duration-300">
      {accent && (
        <div
          className="absolute top-0 left-0 w-full h-0.5 opacity-80"
          style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
        />
      )}
      <p className="text-[11px] font-semibold text-white/40 tracking-widest uppercase mb-2">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-2xl">
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((p, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Per-Model Latency Chart ──────────────────────────────────────────────────

function ModelLatencyChart({ recent }: { recent: HealthCheckRecord[] }) {
  // Transform data to per-model series through time
  const chartData = useMemo(() => {
    const data: Record<string, { time: string; [model: string]: number | string }> = {};
    for (const r of recent.slice().reverse()) {
      const key = formatDate(r.checkedAt);
      if (!data[key]) data[key] = { time: key };
      for (const mr of r.modelResults) {
        if (mr.latencyMs != null) {
          data[key][shortModelId(mr.modelId)] = mr.latencyMs;
        }
      }
    }
    return Object.values(data).slice(-30);
  }, [recent]);

  const modelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of recent) {
      for (const mr of r.modelResults) {
        ids.add(shortModelId(mr.modelId));
      }
    }
    return Array.from(ids);
  }, [recent]);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6">
      <h3 className="text-sm font-bold text-white/80 mb-4">Latencia por Modelo (ms)</h3>
      <ResponsiveContainer {...CHART_COMMON} height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: COLORS.text }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: COLORS.text }} unit="ms" />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, color: COLORS.text }} />
          {modelIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Daily Status Area Chart ──────────────────────────────────────────────────

function DailyStatusChart({ daily }: { daily: DailyAggregate[] }) {
  const data = useMemo(() => daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
    healthy: d.healthyChecks,
    degraded: d.degradedChecks,
    unhealthy: d.unhealthyChecks,
  })), [daily]);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6">
      <h3 className="text-sm font-bold text-white/80 mb-4">Estado Diario de Salud</h3>
      <ResponsiveContainer {...CHART_COMMON} height={280}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.text }} />
          <YAxis tick={{ fontSize: 10, fill: COLORS.text }} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, color: COLORS.text }} />
          <Area
            type="monotone"
            dataKey="healthy"
            stackId="1"
            stroke={COLORS.healthy}
            fill={COLORS.healthy}
            fillOpacity={0.2}
            name="Healthy"
          />
          <Area
            type="monotone"
            dataKey="degraded"
            stackId="1"
            stroke={COLORS.degraded}
            fill={COLORS.degraded}
            fillOpacity={0.2}
            name="Degraded"
          />
          <Area
            type="monotone"
            dataKey="unhealthy"
            stackId="1"
            stroke={COLORS.unhealthy}
            fill={COLORS.unhealthy}
            fillOpacity={0.2}
            name="Unhealthy"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Model Health Summary Pie ─────────────────────────────────────────────────

function ModelPieChart({ models }: { models: ModelHealthSummary[] }) {
  const data = useMemo(() =>
    models.flatMap((m) => [
      { name: `${shortModelId(m.modelId)} ✅`, value: m.healthyCount, fill: COLORS.healthy },
      { name: `${shortModelId(m.modelId)} ⚠️`, value: m.degradedCount, fill: COLORS.degraded },
      { name: `${shortModelId(m.modelId)} ❌`, value: m.failedCount, fill: COLORS.unhealthy },
    ]).filter((d) => d.value > 0),
  [models]);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6">
      <h3 className="text-sm font-bold text-white/80 mb-4">Distribución por Modelo</h3>
      <ResponsiveContainer {...CHART_COMMON} height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, color: COLORS.text }}
            formatter={(value: string) => value.replace(/ [✅⚠️❌]$/, "")}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Average Latency Bar Chart ────────────────────────────────────────────────

function AvgLatencyChart({ daily }: { daily: DailyAggregate[] }) {
  const data = useMemo(() => daily.slice(-14).map((d) => ({
    date: new Date(d.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
    latency: d.avgLatencyMs ?? 0,
    failures: d.totalFailures,
  })), [daily]);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6">
      <h3 className="text-sm font-bold text-white/80 mb-4">Latencia Promedio Diaria (ms)</h3>
      <ResponsiveContainer {...CHART_COMMON} height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: COLORS.text }} />
          <YAxis tick={{ fontSize: 10, fill: COLORS.text }} unit="ms" />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="latency" fill="#06b6d4" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Model Status Table ───────────────────────────────────────────────────────

function ModelTable({ models }: { models: ModelHealthSummary[] }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="p-4 border-b border-white/[0.04]">
        <h3 className="text-sm font-bold text-white/80">Resumen por Modelo</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.04] text-white/40">
              <th className="text-left p-3 font-semibold">Modelo</th>
              <th className="text-right p-3 font-semibold">Chequeos</th>
              <th className="text-right p-3 font-semibold">✅</th>
              <th className="text-right p-3 font-semibold">⚠️</th>
              <th className="text-right p-3 font-semibold">❌</th>
              <th className="text-right p-3 font-semibold">Latencia</th>
              <th className="text-right p-3 font-semibold">Último</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.modelId} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="p-3 font-mono text-[11px]">{shortModelId(m.modelId)}</td>
                <td className="p-3 text-right">{m.totalChecks}</td>
                <td className="p-3 text-right text-emerald-400">{m.healthyCount}</td>
                <td className="p-3 text-right text-amber-400">{m.degradedCount}</td>
                <td className="p-3 text-right text-red-400">{m.failedCount}</td>
                <td className="p-3 text-right">
                  {m.avgLatencyMs ? <>{m.avgLatencyMs}<span className="text-white/30">ms</span></> : "—"}
                </td>
                <td className="p-3 text-right">
                  <span className={`inline-flex items-center gap-1 ${
                    m.lastStatus === "healthy" ? "text-emerald-400" :
                    m.lastStatus === "degraded" ? "text-amber-400" : "text-red-400"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      m.lastStatus === "healthy" ? "bg-emerald-400" :
                      m.lastStatus === "degraded" ? "bg-amber-400" : "bg-red-400"
                    }`} />
                    {m.lastStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recent Checks Table ──────────────────────────────────────────────────────

function RecentChecksTable({ recent }: { recent: HealthCheckRecord[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
        <h3 className="text-sm font-bold text-white/80">Últimos Chequeos</h3>
        <span className="text-[10px] text-white/30">{recent.length} registros</span>
      </div>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#09090b]">
            <tr className="border-b border-white/[0.04] text-white/40">
              <th className="text-left p-3 font-semibold">Fecha</th>
              <th className="text-left p-3 font-semibold">Estado</th>
              <th className="text-right p-3 font-semibold">Healthy</th>
              <th className="text-right p-3 font-semibold">Failed</th>
              <th className="text-right p-3 font-semibold">Total</th>
              <th className="text-right p-3 font-semibold">Latencia</th>
              <th className="text-right p-3 font-semibold">Fuente</th>
            </tr>
          </thead>
          <tbody>              {recent.map((r) => {
              const hasErrors = r.modelResults.some((m) => m.status === "failed");
              return (
                <Fragment key={r.id}>
                  <tr
                    key={r.id}
                    className={`border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors cursor-pointer ${
                      hasErrors ? "bg-red-500/[0.02]" : ""
                    }`}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    <td className="p-3 whitespace-nowrap">{formatDate(r.checkedAt)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.overallStatus === "healthy"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : r.overallStatus === "degraded"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${
                          r.overallStatus === "healthy" ? "bg-emerald-400" :
                          r.overallStatus === "degraded" ? "bg-amber-400" : "bg-red-400"
                        }`} />
                        {r.overallStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right text-emerald-400">{r.modelsHealthy}</td>
                    <td className="p-3 text-right text-red-400">{r.modelsFailed}</td>
                    <td className="p-3 text-right">{r.modelsTotal}</td>
                    <td className="p-3 text-right">
                      {r.avgLatencyMs ? <>{r.avgLatencyMs}<span className="text-white/30">ms</span></> : "—"}
                    </td>
                    <td className="p-3 text-right text-white/40">{r.triggerSource}</td>
                  </tr>
                  {expanded === r.id && r.modelResults.length > 0 && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={7} className="p-3 bg-white/[0.01]">
                        <div className="space-y-1">
                          {r.modelResults.map((mr) => (
                            <div
                              key={mr.modelId}
                              className="flex items-center gap-3 text-[11px] font-mono px-3 py-1.5 rounded-lg"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                mr.status === "healthy" ? "bg-emerald-400" :
                                mr.status === "degraded" ? "bg-amber-400" : "bg-red-400"
                              }`} />
                              <span className="text-white/60 w-40 truncate">{shortModelId(mr.modelId)}</span>
                              <span className={
                                mr.status === "healthy" ? "text-emerald-400" :
                                mr.status === "degraded" ? "text-amber-400" : "text-red-400"
                              }>
                                {mr.status}
                              </span>
                              <span className="text-white/30">
                                {mr.latencyMs ? `${mr.latencyMs}ms` : "—"}
                              </span>
                              {mr.error && (
                                <span className="text-red-400/60 truncate max-w-[200px]" title={mr.error}>
                                  {mr.error}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Failure Events List ──────────────────────────────────────────────────────

function FailureList({ recent }: { recent: HealthCheckRecord[] }) {
  const failures = useMemo(() => {
    const list: Array<{
      modelId: string; error: string; checkedAt: string; latencyMs: number | null;
    }> = [];
    for (const r of recent) {
      for (const mr of r.modelResults) {
        if (mr.status === "failed" && mr.error) {
          list.push({
            modelId: shortModelId(mr.modelId),
            error: mr.error,
            checkedAt: r.checkedAt,
            latencyMs: mr.latencyMs,
          });
        }
      }
    }
    return list;
  }, [recent]);

  if (failures.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-6 flex items-center justify-center text-white/30 text-sm">
        <div className="text-center">
          <span className="text-2xl block mb-2">✅</span>
          Sin fallos registrados en los últimos chequeos
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
      <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
        <h3 className="text-sm font-bold text-red-400/80">Eventos de Fallo</h3>
        <span className="text-[10px] text-white/30">{failures.length} eventos</span>
      </div>
      <div className="divide-y divide-white/[0.03] max-h-[320px] overflow-y-auto">
        {failures.map((f, i) => (
          <div key={i} className="p-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs text-red-400">{f.modelId}</span>
              <span className="text-[10px] text-white/30">{timeAgo(f.checkedAt)}</span>
            </div>
            <p className="text-[11px] text-white/50 truncate" title={f.error}>
              {f.error}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────

export function AiHealthDashboardClient({ recent, daily, models, latest }: Props) {
  const failRate = latest && latest.modelsTotal > 0
    ? ((latest.modelsFailed / latest.modelsTotal) * 100).toFixed(1)
    : "0";

  const totalFailures = useMemo(
    () => recent.reduce((acc, r) => acc + r.modelsFailed, 0),
    [recent]
  );

  const avgLatency = useMemo(() => {
    const valid = recent.filter((r) => r.avgLatencyMs != null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, r) => a + (r.avgLatencyMs ?? 0), 0) / valid.length);
  }, [recent]);

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🩺 Salud del Motor de IA</h1>
          <p className="text-sm text-white/40 mt-1">
            Monitoreo de modelos :free en OpenRouter · Último chequeo:
            {" "}{latest ? timeAgo(latest.checkedAt) : "Nunca"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PushSubscribeButton />
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all text-white/60 hover:text-white/80"
          >
            ↻ Refrescar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Estado Actual"
          value={latest?.overallStatus ?? "Sin datos"}
          accent={latest?.overallStatus === "healthy" ? COLORS.healthy : latest?.overallStatus === "degraded" ? COLORS.degraded : COLORS.unhealthy}
        />
        <StatCard
          label="Total Chequeos"
          value={recent.length}
          sub="últimos registros"
          accent="#06b6d4"
        />
        <StatCard
          label="Tasa de Fallo"
          value={`${failRate}%`}
          sub={latest ? `${latest.modelsFailed}/${latest.modelsTotal} modelos` : "—"}
          accent={parseFloat(failRate) > 0 ? COLORS.unhealthy : COLORS.healthy}
        />
        <StatCard
          label="Fallos Acumulados"
          value={totalFailures}
          sub={avgLatency ? `latencia promedio ${avgLatency}ms` : "sin datos de latencia"}
          accent={totalFailures > 0 ? COLORS.unhealthy : COLORS.healthy}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyStatusChart daily={daily} />
        <ModelLatencyChart recent={recent} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModelPieChart models={models} />
        <AvgLatencyChart daily={daily} />
      </div>

      {/* Failures + Model Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FailureList recent={recent} />
        <ModelTable models={models} />
      </div>

      {/* Recent Checks Table */}
      <RecentChecksTable recent={recent} />
    </div>
  );
}
