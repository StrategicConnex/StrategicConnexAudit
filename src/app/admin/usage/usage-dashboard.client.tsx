"use client";

// IMPORT EXACTO alineado a src/app/ai/health/health-dashboard.client.tsx:22 —
// conflicto de firma permitido por el plan (Task 8, Step 4): `useChartColors()`
// NO exporta `primary`/`mutedForeground`; exporta `models[0]`/`text`.
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChartColors } from "@/shared/design-system";
import type { UsageMetrics } from "@/server/admin/usage-metrics";

const KPI = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

export function UsageDashboard({
  metrics,
  daily,
}: {
  metrics: UsageMetrics;
  daily: Array<{ date: string; n: number }>;
}) {
  const colors = useChartColors();
  const primary = colors.models[0] ?? colors.healthy;
  const hitRate =
    metrics.aiCacheHitsLast30d.total === 0
      ? null
      : Math.round((metrics.aiCacheHitsLast30d.hits / metrics.aiCacheHitsLast30d.total) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI label="Usuarios totales" value={metrics.totalUsers} />
        <KPI label="Usuarios activos (7d)" value={metrics.activeUsersLast7d} />
        <KPI label="Proyectos" value={metrics.totalProjects} />
        <KPI label="Auditorías (30d)" value={metrics.auditsLast30d} />
        <KPI label="Findings (30d)" value={metrics.findingsLast30d} />
        <KPI
          label="Llamadas IA (30d)"
          value={metrics.aiCallsLast30d}
          hint={hitRate === null ? undefined : `Hit-rate caché: ${hitRate}%`}
        />
        <KPI
          label="Tokens IA (30d)"
          value={`${metrics.aiTokensLast30d.in} / ${metrics.aiTokensLast30d.out}`}
          hint="entrada / salida"
        />
        <KPI label="Coste IA (30d)" value={`$${metrics.aiCostUsdLast30d.toFixed(2)}`} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Auditorías por día (30d)</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="usageAudits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{ fill: colors.text }} fontSize={11} />
              <YAxis allowDecimals={false} tick={{ fill: colors.text }} fontSize={11} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="n"
                name="Auditorías"
                stroke={primary}
                fill="url(#usageAudits)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Findings por severidad (30d)</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {(
            Object.entries(metrics.findingsBySeverity) as Array<
              [keyof UsageMetrics["findingsBySeverity"], number]
            >
          ).map(([severity, n]) => (
            <li key={severity} className="rounded-md bg-surface px-3 py-2">
              <span className="text-muted-foreground">{severity}</span>
              <span className="block text-lg font-bold">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Nombre legado del plan: el consumidor server importa `UsageDashboardLazy`.
export const UsageDashboardLazy = UsageDashboard;
