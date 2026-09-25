import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  RefreshCw, ChevronRight, Info,
  Globe, Terminal, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer
} from 'recharts';
import type { ProjectRow } from '@/shared/db/types';
import { getPerformanceSnapshot } from '@/app/actions/performance';
import type { PerformanceSnapshot, VitalStatus } from '@/app/actions/performance';

interface PerformanceTabProps {
  dashboardData: ProjectRow[];
}

/* ─── Reusable color tokens ─────────────────────────────────── */
const COLORS = {
  primary: "var(--primary)",
  chartreuse: "var(--accent)",
  destructive: 'oklch(55% 0.22 25)',
  warning: 'oklch(75% 0.13 80)',
  muted: 'oklch(50% 0.02 265)',
  track: 'oklch(15% 0.008 265 / 0.25)',
} as const;

const STATUS_LABEL_KEY = {
  good: 'statusGood',
  needs_improvement: 'statusNeedsImprovement',
  poor: 'statusPoor',
} as const;

function statusColor(status: VitalStatus | null): string {
  if (status === 'good') return COLORS.chartreuse;
  if (status === 'needs_improvement') return COLORS.warning;
  if (status === 'poor') return COLORS.destructive;
  return COLORS.muted;
}

function statusClass(status: VitalStatus | null): string {
  if (status === 'good') return 'text-chartreuse';
  if (status === 'needs_improvement') return 'text-[oklch(75% 0.13 80)]';
  if (status === 'poor') return 'text-[oklch(55% 0.22 25)]';
  return 'text-muted-fg';
}

function fmtLcp(ms: number | null): string {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}
function fmtCls(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}
function fmtInp(ms: number | null): string {
  return ms == null ? '—' : `${Math.round(ms)}ms`;
}
/** % de la barra contra el umbral "poor" (0-100, capado). */
function barWidth(value: number | null, poorThreshold: number): string {
  if (value == null) return '0%';
  return `${Math.min(100, Math.max(2, (value / poorThreshold) * 100))}%`;
}

export function PerformanceTab({ dashboardData }: PerformanceTabProps) {
  const t = useTranslations('performance');
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const result = await getPerformanceSnapshot({});
    if (result.data) {
      setSnapshot(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Error cargando métricas');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchSnapshot();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchSnapshot]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetchSnapshot();
    } finally {
      setSyncing(false);
    }
  };

  const vitals = snapshot?.vitals ?? null;
  const overall = snapshot?.overallScore ?? null;
  const segments = snapshot?.healthSegments ?? { critical: 0, warning: 0, good: 0 };
  const segmentTotal = segments.critical + segments.warning + segments.good;
  const scoreById = new Map((snapshot?.projects ?? []).map((p) => [p.id, p.score]));

  const healthSegments = [
    ...(segments.critical > 0 ? [{ name: t('legendCritical'), value: segments.critical, fill: COLORS.destructive }] : []),
    ...(segments.warning > 0 ? [{ name: t('legendWarning'), value: segments.warning, fill: COLORS.warning }] : []),
    ...(segments.good > 0 ? [{ name: t('legendGood'), value: segments.good, fill: COLORS.chartreuse }] : []),
  ];

  const scoreLabel = overall == null
    ? t('noData')
    : overall >= 90 ? t('excellent') : overall >= 60 ? t('statusNeedsImprovement') : t('statusPoor');

  const healthLabel = overall == null
    ? t('noData')
    : overall >= 85 ? t('optimal') : overall >= 60 ? t('statusNeedsImprovement') : t('statusPoor');

  const hasSparklineData = (vitals?.sparkline ?? []).some((b) => b.v != null);

  const updatedLabel = snapshot
    ? new Date(snapshot.updatedAt).toLocaleString('en-US', {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      })
    : '—';

  return (
    <div className="space-y-8 relative z-10 font-sans text-foreground pb-12">

      {/* ═══════════════════════════════════════════════════════════
         HEADER
         ═══════════════════════════════════════════════════════════ */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/5 to-transparent opacity-50 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {t('pageTitle')}
                <span className="text-muted-fg font-light text-base">{t('pageSubtitle')}</span>
                <span className="text-muted-fg/50 text-sm hidden sm:inline">|</span>
                <span className="text-muted-fg/80 font-medium text-base hidden sm:inline">
                  {t('pageDomainOverview')}
                </span>
              </h2>
            </div>
            <p className="text-xs font-mono text-muted-fg tracking-wider">
              {t('lastUpdated')} {updatedLabel}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* RUM badge — datos reales de la ventana */}
            <div className="flex items-center gap-2 bg-chartreuse/10 border border-chartreuse/20 px-3.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse" />
              <span className="text-2xs font-extrabold uppercase tracking-widest text-chartreuse">
                {t('rumBadge')}
              </span>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || loading}
              className="flex items-center gap-2 text-2xs font-extrabold uppercase tracking-widest text-muted-fg hover:text-primary transition-[color,background-color,border-color,opacity] px-4 py-2.5 rounded-xl bg-muted/10 border border-border hover:border-primary/30 hover:bg-muted/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-primary' : ''}`} />
              {syncing ? t('syncingButton') : t('syncButton')}
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="glass-card rounded-2xl p-5 flex items-center gap-3 border border-[oklch(55% 0.22 25)]/30">
          <AlertTriangle className="w-4 h-4 text-[oklch(55% 0.22 25)]" />
          <span className="text-sm text-muted-fg">{loadError}</span>
        </div>
      )}

      {loading && !snapshot ? (
        <div className="glass-card rounded-2xl p-10 flex items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : snapshot && (

      <>
      {/* ═══════════════════════════════════════════════════════════
         MAIN GRID — 2/3 vitals  +  1/3 health gauge
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: Core Web Vitals ──────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col p-6 glass-card rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wider">
                {t('vitalsTitle')}
              </h3>
              <Info className="w-3.5 h-3.5 text-muted-fg cursor-help hover:text-muted-fg/80 transition-colors" />
            </div>
            <div className="flex items-center gap-1 bg-muted/10 border border-border px-2.5 py-1 rounded-lg text-2xs text-muted-fg font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/20 transition-colors">
              <span>{t('last30m')}</span>
              <ChevronRight size={10} className="rotate-90" />
            </div>
          </div>

          {vitals && vitals.sampleCount === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2 text-center">
              <AlertTriangle className="w-5 h-5 text-muted-fg" />
              <p className="text-sm font-bold text-muted-fg">{t('noData')}</p>
              <p className="text-2xs text-muted-fg/70 uppercase tracking-widest">{t('noDataHint')}</p>
            </div>
          ) : vitals && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* LCP */}
            <VitalCard
              label={t('lcpLabel')}
              value={fmtLcp(vitals.lcpMs)}
              status={vitals.lcpStatus}
              statusText={vitals.lcpStatus ? t(STATUS_LABEL_KEY[vitals.lcpStatus]) : t('noData')}
              barPct={barWidth(vitals.lcpMs, 4000)}
            />

            {/* CLS */}
            <VitalCard
              label={t('clsLabel')}
              value={fmtCls(vitals.cls)}
              status={vitals.clsStatus}
              statusText={vitals.clsStatus ? t(STATUS_LABEL_KEY[vitals.clsStatus]) : t('noData')}
              barPct={barWidth(vitals.cls, 0.25)}
            />

            {/* INP — sparkline real de la ventana */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('inpLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span
                  className="text-2xs font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider"
                  style={{
                    color: statusColor(vitals.inpStatus),
                    borderColor: `${statusColor(vitals.inpStatus)}33`,
                    backgroundColor: `${statusColor(vitals.inpStatus)}1a`,
                  }}
                >
                  {vitals.inpStatus ? t(STATUS_LABEL_KEY[vitals.inpStatus]) : t('noData')}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-foreground">{fmtInp(vitals.inpMs)}</span>
              </div>

              <div className="h-12 w-full mt-1">
                {hasSparklineData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={vitals.sparkline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="warmSparkline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={statusColor(vitals.inpStatus)} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={statusColor(vitals.inpStatus)} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={statusColor(vitals.inpStatus)}
                        strokeWidth={1.5}
                        fill="url(#warmSparkline)"
                        dot={false}
                        activeDot={false}
                        connectNulls
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-2xs text-muted-fg uppercase tracking-widest">
                    {t('noData')}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="w-full bg-muted/10 h-1.5 rounded-full overflow-hidden border border-border/30">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: barWidth(vitals.inpMs, 500),
                      background: `linear-gradient(to right, ${statusColor(vitals.inpStatus)}, ${COLORS.primary})`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-2xs text-muted-fg font-semibold tracking-wider uppercase mt-1">
                  <span className="font-bold" style={{ color: statusColor(vitals.inpStatus) }}>
                    {vitals.inpStatus ? t(STATUS_LABEL_KEY[vitals.inpStatus]) : t('noData')}
                  </span>
                  <span className="text-muted-fg">{fmtInp(vitals.inpMs)}</span>
                </div>
              </div>
            </div>

            {/* Overall Score — gauge real (promedio de salud por proyecto) */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('scoreLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span className="text-2xs font-extrabold text-primary">
                  {t('indexLabel')} {overall ?? '—'}
                </span>
              </div>

              <div className="flex items-center justify-center h-28 relative mt-2">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Score', value: overall ?? 0, fill: COLORS.primary },
                        { name: '', value: Math.max(0, 100 - (overall ?? 0)), fill: 'transparent' },
                      ]}
                      cx="50%"
                      cy="95%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={65}
                      outerRadius={82}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive
                    >
                      {[0, 1].map((i) => (
                        <Cell key={i} fill={i === 0 ? COLORS.primary : 'transparent'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-3 pointer-events-none">
                  <span className="text-4xl font-extrabold tracking-tighter text-foreground leading-none">
                    {overall ?? '—'}
                  </span>
                  <span className="text-2xs font-black text-primary uppercase tracking-widest mt-1.5">
                    {scoreLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* ── RIGHT: Project Health Gauge — donut real ───────────── */}
        <div className="flex flex-col p-6 glass-card rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wider">
                {t('healthTitle')}
              </h3>
              <Info className="w-3.5 h-3.5 text-muted-fg cursor-help hover:text-muted-fg/80 transition-colors" />
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-8">
            {segmentTotal === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertTriangle className="w-5 h-5 text-muted-fg" />
                <p className="text-sm font-bold text-muted-fg">{t('noData')}</p>
                <p className="text-2xs text-muted-fg/70 uppercase tracking-widest">{t('noDataHint')}</p>
              </div>
            ) : (
              <>
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthSegments}
                        cx="50%"
                        cy="50%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={84}
                        dataKey="value"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive
                      >
                        {healthSegments.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1 pointer-events-none">
                    <span className="text-4xl font-black text-foreground tracking-tighter flex items-baseline">
                      {overall != null ? Math.round(overall) : '—'}
                      <span className="text-muted-fg/60 text-lg font-bold">/100</span>
                    </span>
                    <span className="text-2xs font-black text-muted-fg uppercase tracking-widest">
                      {t('liveIndex')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6 justify-center w-full text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                  <LegendDot color={COLORS.destructive} label={`${t('legendCritical')} · ${segments.critical}`} />
                  <LegendDot color={COLORS.warning} label={`${t('legendWarning')} · ${segments.warning}`} />
                  <LegendDot color={COLORS.chartreuse} label={`${t('legendGood')} · ${segments.good}`} />
                </div>

                <div className="text-center space-y-1 pt-2 w-full border-t border-border/50">
                  <span className="block text-2xs uppercase font-black tracking-widest text-muted-fg">
                    {t('healthStatus')}
                  </span>
                  <span
                    className={`block text-2xl font-black uppercase tracking-tight ${
                      overall != null && overall >= 85 ? 'text-chartreuse scan-pulse' : statusClass(
                        overall == null ? null : overall >= 60 ? 'needs_improvement' : 'poor',
                      )
                    }`}
                  >
                    {healthLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         RECENT PROJECTS — score real por proyecto
         ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 px-1">
          <h3 className="font-extrabold text-foreground text-base tracking-tight uppercase tracking-wider">
            {t('recentProjects')}
          </h3>
          <span className="w-1.5 h-1.5 rounded-full bg-primary scan-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dashboardData.map((project, idx) => {
            const score = scoreById.get(project.id) ?? null;
            const hasScore = score != null;
            const isGood = hasScore && score >= 85;
            const label = !hasScore ? t('projectsNoData') : isGood ? t('healthy') : t('warningIssues');
            const IconComp = idx % 2 === 0 ? Terminal : Globe;
            const accentColor = hasScore
              ? isGood ? COLORS.chartreuse : COLORS.warning
              : COLORS.muted;

            return (
              <div
                key={project.id}
                className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div
                  className="absolute top-0 left-0 w-[3px] h-0 group-hover:h-full transition-[height,background-color] duration-300"
                  style={{ backgroundColor: accentColor }}
                />

                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300"
                      style={{
                        backgroundColor: `${accentColor}0d`,
                        borderColor: `${accentColor}1a`,
                        color: accentColor,
                      }}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-extrabold text-foreground text-base truncate tracking-tight">
                        {project.name}
                      </h4>
                      <p className="text-2xs font-bold text-muted-fg uppercase tracking-widest truncate">
                        {project.domain}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <span className="text-base font-black" style={{ color: accentColor }}>
                      {hasScore ? `${score}/100` : '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: accentColor }}
                    />
                    <span
                      className="text-2xs font-extrabold uppercase tracking-widest"
                      style={{ color: accentColor }}
                    >
                      {label}
                    </span>
                  </div>

                  <Link
                    href={`/projects/${project.id}`}
                    className="text-2xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-[color,background-color,border-color,opacity,transform] transform translate-x-2 group-hover:translate-x-0 bg-primary/10 border border-primary/20 px-3.5 py-2 rounded-xl hover:bg-primary/20"
                  >
                    {t('viewAudit')} <ChevronRight size={12} strokeWidth={2.5} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ─── Core Web Vital card (valor real + barra vs umbral) ────── */
function VitalCard({
  label, value, status, statusText, barPct,
}: {
  label: string;
  value: string;
  status: VitalStatus | null;
  statusText: string;
  barPct: string;
}) {
  return (
    <div className="glass-card rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
          {label}
          <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
        </span>
        <span
          className="text-2xs font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider"
          style={{
            color: statusColor(status),
            borderColor: `${statusColor(status)}33`,
            backgroundColor: `${statusColor(status)}1a`,
          }}
        >
          {statusText}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight text-foreground">{value}</span>
      </div>
      <div className="space-y-1.5">
        <div className="w-full bg-muted/10 h-1.5 rounded-full overflow-hidden border border-border/30">
          <div
            className="h-full rounded-full"
            style={{
              width: barPct,
              background: `linear-gradient(to right, ${statusColor(status)}, ${COLORS.primary})`,
            }}
          />
        </div>
        <div className="flex justify-between text-2xs text-muted-fg font-semibold tracking-wider uppercase mt-1">
          <span className="font-bold" style={{ color: statusColor(status) }}>{statusText}</span>
          <span>{value}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Small legend dot helper ───────────────────────────────── */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}
