import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  RefreshCw, ChevronRight, Info, Settings, MoreVertical,
  Globe, Terminal
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer
} from 'recharts';
import type { ProjectRow } from '@/shared/db/types';

interface PerformanceTabProps {
  dashboardData: ProjectRow[];
}

/* ─── Reusable color tokens ─────────────────────────────────── */
const COLORS = {
  primary: "var(--primary)",
  chartreuse: "var(--accent)",
  destructive: 'oklch(55% 0.22 25)',
  warning: 'oklch(75% 0.13 80)',
  track: 'oklch(15% 0.008 265 / 0.25)',
} as const;

/* ─── Sparkline data for INP chart ──────────────────────────── */
const sparklineData = [
  { v: 50 }, { v: 48 }, { v: 42 },
  { v: 46 }, { v: 25 }, { v: 40 },
  { v: 15 }, { v: 38 }, { v: 45 },
];

/* ─── Health-gauge segment data ─────────────────────────────── */
const healthSegments = [
  { name: 'Crítico', value: 15, fill: COLORS.destructive },
  { name: 'Advertencia', value: 20, fill: COLORS.warning },
  { name: 'Bueno', value: 235, fill: COLORS.chartreuse },
];

export function PerformanceTab({ dashboardData }: PerformanceTabProps) {
  const t = useTranslations('performance');
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const opts: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZoneName: 'short',
      };
      setCurrentTime(d.toLocaleDateString('en-US', opts));
    };
    updateTime();
    const id = setInterval(updateTime, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1200);
  };

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
              {currentTime}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live badge */}
            <div className="flex items-center gap-2 bg-chartreuse/10 border border-chartreuse/20 px-3.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse" />
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-chartreuse">
                {t('liveBadge')}
              </span>
            </div>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-fg hover:text-primary transition-[color,background-color,border-color,opacity] px-4 py-2.5 rounded-xl bg-muted/10 border border-border hover:border-primary/30 hover:bg-muted/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-primary' : ''}`} />
              {syncing ? t('syncingButton') : t('syncButton')}
            </button>

            <div className="flex items-center gap-1.5 border border-border rounded-xl bg-muted/10 p-1">
              <button className="p-1.5 rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer">
                <Settings size={14} />
              </button>
              <button className="p-1.5 rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer">
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

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
            <div className="flex items-center gap-1 bg-muted/10 border border-border px-2.5 py-1 rounded-lg text-[10px] text-muted-fg font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/20 transition-colors">
              <span>{t('last30m')}</span>
              <ChevronRight size={10} className="rotate-90" />
            </div>
          </div>

          {/* ── 2×2 card grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* LCP */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('lcpLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-chartreuse bg-chartreuse/10 border-chartreuse/20 uppercase tracking-wider">
                  {t('lcpGood')}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-foreground">1.8s</span>
              </div>
              <div className="space-y-1.5">
                <div className="w-full bg-muted/10 h-1.5 rounded-full overflow-hidden border border-border/30">
                  <div className="bg-gradient-to-r from-chartreuse to-primary h-full rounded-full w-[85%]" />
                </div>
                <div className="flex justify-between text-[9px] text-muted-fg font-semibold tracking-wider uppercase mt-1">
                  <span className="text-chartreuse font-bold">{t('lcpStatus')}</span>
                  <span>1.8s</span>
                </div>
              </div>
            </div>

            {/* CLS */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('clsLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-chartreuse bg-chartreuse/10 border-chartreuse/20 uppercase tracking-wider">
                  {t('lcpGood')}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-foreground">0.03</span>
              </div>
              <div className="space-y-1.5">
                <div className="w-full bg-muted/10 h-1.5 rounded-full overflow-hidden border border-border/30">
                  <div className="bg-gradient-to-r from-chartreuse to-primary h-full rounded-full w-[92%]" />
                </div>
                <div className="flex justify-between text-[9px] text-muted-fg font-semibold tracking-wider uppercase mt-1">
                  <span className="text-chartreuse font-bold">{t('clsStatus')}</span>
                  <span>0.03</span>
                </div>
              </div>
            </div>

            {/* INP — Recharts AreaChart sparkline */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('inpLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20 uppercase tracking-wider">
                  {t('inpNeedsImprovement')}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-foreground">210ms</span>
              </div>

              {/* ── Real Recharts AreaChart ── */}
              <div className="h-12 w-full mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="warmSparkline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.warning} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={COLORS.warning} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={COLORS.warning}
                      strokeWidth={1.5}
                      fill="url(#warmSparkline)"
                      dot={false}
                      activeDot={false}
                      isAnimationActive
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1">
                <div className="w-full bg-muted/10 h-1.5 rounded-full overflow-hidden border border-border/30">
                  <div className="bg-gradient-to-r from-[oklch(75% 0.13 80)] to-[oklch(80% 0.12 90)] h-full rounded-full w-[65%]" />
                </div>
                <div className="flex justify-between text-[9px] font-semibold tracking-wider uppercase mt-1">
                  <span className="text-[oklch(75% 0.13 80)] font-bold">{t('inpWarning')}</span>
                  <span className="text-muted-fg">{t('inpThreshold')}</span>
                </div>
              </div>
            </div>

            {/* Overall Score — Recharts PieChart semi-circle */}
            <div className="glass-card rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1">
                  {t('scoreLabel')}
                  <Info className="w-3 h-3 text-muted-fg/60 hover:text-muted-fg cursor-help" />
                </span>
                <span className="text-[9px] font-extrabold text-primary">{t('indexLabel')} 91.4</span>
              </div>

              <div className="flex items-center justify-center h-28 relative mt-2">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Score', value: 91.4, fill: COLORS.primary },
                        { name: '', value: 8.6, fill: 'transparent' },
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
                {/* Overlaid text */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-3 pointer-events-none">
                  <span className="text-4xl font-extrabold tracking-tighter text-foreground leading-none">91.4</span>
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest mt-1.5 scan-pulse">
                    {t('excellent')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Project Health Gauge — Recharts donut ───────── */}
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
            {/* ── Real Recharts PieChart (donut) ── */}
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

              {/* Central score */}
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1 pointer-events-none">
                <span className="text-4xl font-black text-foreground tracking-tighter flex items-baseline">
                  94<span className="text-muted-fg/60 text-lg font-bold">/100</span>
                </span>
                <span className="text-[9px] font-black text-muted-fg uppercase tracking-widest">
                  {t('liveIndex')}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 justify-center w-full text-[10px] font-extrabold uppercase tracking-widest text-muted-fg">
              <LegendDot color={COLORS.destructive} label={t('legendCritical')} />
              <LegendDot color={COLORS.warning} label={t('legendWarning')} />
              <LegendDot color={COLORS.chartreuse} label={t('legendGood')} />
            </div>

            {/* Status */}
            <div className="text-center space-y-1 pt-2 w-full border-t border-border/50">
              <span className="block text-[9px] uppercase font-black tracking-widest text-muted-fg">
                {t('healthStatus')}
              </span>
              <span className="block text-2xl font-black text-chartreuse uppercase tracking-tight scan-pulse">
                {t('optimal')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         RECENT PROJECTS
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
            let score = 91;
            let label = t('healthy');
            let isGood = true;
            let IconComp = Globe;

            if (idx === 1) {
              score = 76;
              label = t('warningClsIssues');
              isGood = false;
              IconComp = Globe;
            } else if (idx === 2) {
              score = 88;
              label = t('healthy');
              isGood = true;
              IconComp = Terminal;
            } else if (idx > 2) {
              score = 80 + ((idx * 7) % 19);
              isGood = score >= 90;
              label = isGood ? t('healthy') : t('warningLayoutShifts');
              IconComp = idx % 2 === 0 ? Terminal : Globe;
            }

            return (
              <div
                key={project.id}
                className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300"
              >
                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                {/* Left accent bar */}
                <div
                  className={`absolute top-0 left-0 w-[3px] h-0 ${isGood ? 'bg-chartreuse' : 'bg-[oklch(75% 0.13 80)]'} group-hover:h-full transition-[height,background-color] duration-300`}
                />

                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300 ${
                        isGood
                          ? 'bg-chartreuse/5 border-chartreuse/10 text-chartreuse group-hover:bg-chartreuse/10 group-hover:border-chartreuse/20'
                          : 'bg-[oklch(75% 0.13 80)]/5 border-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] group-hover:bg-[oklch(75% 0.13 80)]/10 group-hover:border-[oklch(75% 0.13 80)]/20'
                      }`}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-extrabold text-foreground text-base truncate tracking-tight">
                        {project.name}
                      </h4>
                      <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest truncate">
                        {project.domain}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <span
                      className={`text-base font-black ${isGood ? 'text-chartreuse' : 'text-[oklch(75% 0.13 80)]'}`}
                    >
                      {score}/100
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${isGood ? 'bg-chartreuse' : 'bg-[oklch(75% 0.13 80)]'}`}
                    />
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-widest ${isGood ? 'text-chartreuse' : 'text-[oklch(75% 0.13 80)]'}`}
                    >
                      {label}
                    </span>
                  </div>

                  <Link
                    href={`/projects/${project.id}`}
                    className="text-[9px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-[color,background-color,border-color,opacity,transform] transform translate-x-2 group-hover:translate-x-0 bg-primary/10 border border-primary/20 px-3.5 py-2 rounded-xl hover:bg-primary/20"
                  >
                    {t('viewAudit')} <ChevronRight size={12} strokeWidth={2.5} />
                  </Link>
                </div>
              </div>
            );
          })}
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
