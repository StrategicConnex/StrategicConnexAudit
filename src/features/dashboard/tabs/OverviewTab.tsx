'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Globe, ChevronRight, Activity, WifiOff, Bell,
  Terminal, CheckCircle2, Zap, ClipboardList,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProjectCard } from '../ProjectCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { MetricCard } from '@/components/MetricCard';
import {
  ActivityTimeline,
  buildTimelineEvents,
} from '@/components/ActivityTimeline';
import { JargonTerm } from '@/components/ui/JargonTerm';
import { OnboardingChecklist } from '../OnboardingChecklist';
import { ForecastCard } from '../ForecastCard';
import { Card } from '@/components/ui/Card';
import type { ProjectWithNested } from '@/shared/db/types';
import type { TimelineEvent } from '@/components/ActivityTimeline';

/**
 * BenchmarkingSection pulls in recharts (~570KB) — defer the chunk until the
 * section scrolls into view so the default tab's first paint stays light.
 */
const BenchmarkingSection = dynamic(
  () => import('../BenchmarkingSection').then((m) => ({ default: m.BenchmarkingSection })),
  { loading: () => <Card className="p-6 min-h-[200px] animate-pulse" aria-busy="true" /> }
);

function LazyBenchmarkingSection({ projectId }: { projectId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry || !entry.isIntersecting) return;
        setInView(true);
        obs.disconnect();
      },
      { rootMargin: '300px' } // start loading just before it scrolls into view
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {inView ? (
        <BenchmarkingSection projectId={projectId} />
      ) : (
        <Card className="p-6 min-h-[200px] animate-pulse" aria-hidden="true" />
      )}
    </div>
  );
}

export type { ProjectWithNested };

interface OverviewTabProps {
  initialProjects: ProjectWithNested[];
  dashboardData: ProjectWithNested[];
  setActiveTab: (tab: string) => void;
  projectId?: string;
  /** Iniciales para la bienvenida (p. ej. "AB"). */
  userInitials?: string;
}

interface LiveCheck {
  isUp: boolean | null;
  responseTimeMs: number | null;
  checkedAt: string;
}

interface HeroLive {
  status: 'loading' | 'live' | 'empty';
  checks: LiveCheck[];
  uptimePercent: number | null;
  avgLatencyMs: number | null;
  aiHealthy: number | null;
}

const HERO_EMPTY: HeroLive = { status: 'empty', checks: [], uptimePercent: null, avgLatencyMs: null, aiHealthy: null };

// ─── OverviewSummary (Semana 5) ─────────────────────────────────────────────

function OverviewSummary({
  userInitials,
  projectCount,
  auditedCount,
  uptimePercent,
  failedChecks,
  checksLoading,
  events,
}: {
  userInitials?: string;
  projectCount: number;
  auditedCount: number;
  uptimePercent: number | null;
  failedChecks: number;
  checksLoading: boolean;
  events: TimelineEvent[];
}) {
  const t = useTranslations('overview');
  const coverage = projectCount > 0 ? (auditedCount / projectCount) * 100 : null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <p className="text-2xs font-extrabold uppercase tracking-widest text-primary">
            {t('greeting')}
            {userInitials ? `, ${userInitials}` : ''}
          </p>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-foreground mt-1">
            {t('welcomeSummary', { count: projectCount })}
          </h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
            <MetricCard
              icon={<Globe aria-hidden="true" />}
              label={t('metricsProjects')}
              value={String(projectCount)}
            />
            <MetricCard
              icon={<ClipboardList aria-hidden="true" />}
              label={t('metricsAudits')}
              value={String(auditedCount)}
            />
            <MetricCard
              icon={<Activity aria-hidden="true" />}
              label={t('metricsUptime')}
              value={
                uptimePercent != null ? `${(uptimePercent * 100).toFixed(1)}%` : '—'
              }
            />
            <MetricCard
              icon={<Bell aria-hidden="true" />}
              label={t('metricsAlerts')}
              value={checksLoading ? '—' : String(failedChecks)}
            />
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-5">
          <ScoreGauge value={coverage} ariaLabel={t('portfolioCoverage')} />
          <div className="flex flex-col gap-1">
            <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
              {t('portfolioCoverage')}
            </p>
            <p className="font-display text-xl font-extrabold tabular-nums text-foreground">
              {auditedCount}
              <span className="text-xs font-mono text-muted-fg">/{projectCount}</span>
            </p>
          </div>
        </Card>
      </div>
      <Card className="p-6">
        <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest mb-4">
          {t('timelineTitle')}
        </h3>
        <ActivityTimeline events={events} emptyLabel={t('timelineEmpty')} />
      </Card>
    </div>
  );
}

export function OverviewTab({ dashboardData, setActiveTab, projectId, userInitials }: OverviewTabProps) {
  const t = useTranslations('overview');
  const [hero, setHero] = useState<HeroLive>({ ...HERO_EMPTY, status: 'loading' });

  // Telemetría real del hero: últimos chequeos de uptime (24h) + salud de IA.
  // 401/sin datos → estado vacío honesto, nunca cifras inventadas.
  useEffect(() => {
    let cancelled = false;
    const params = projectId ? `?projectId=${projectId}` : '';
    Promise.allSettled([
      fetch(`/api/intelligence/live${params}`).then(async (r) => {
        if (r.status === 401) return null;
        const d = await r.json();
        return d.success ? d : null;
      }).catch(() => null),
      fetch('/api/ai/healthcheck', { signal: AbortSignal.timeout(8000) }).then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      }).catch(() => null),
    ]).then(([liveRes, aiRes]) => {
      if (cancelled) return;
      const live = liveRes.status === 'fulfilled' ? liveRes.value : null;
      const checks = (live?.uptime?.checks ?? []) as LiveCheck[];
      const ai = aiRes.status === 'fulfilled' ? aiRes.value : null;
      if (!live || checks.length === 0) {
        setHero({ ...HERO_EMPTY });
        return;
      }
      setHero({
        status: 'live',
        checks,
        uptimePercent: typeof live.uptime?.uptimePercent === 'number' ? live.uptime.uptimePercent : null,
        avgLatencyMs: typeof live.uptime?.avgLatencyMs === 'number' ? live.uptime.avgLatencyMs : null,
        aiHealthy: typeof ai?.modelsHealthy === 'number' ? ai.modelsHealthy : null,
      });
    }).catch(() => {
      if (!cancelled) setHero({ ...HERO_EMPTY });
    });
    return () => { cancelled = true; };
  }, [projectId]);
  return (
    <div className="space-y-6">

      {/* Page title — h1 lives in DashboardHeader; this is the in-content h2 */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <Activity aria-hidden="true" className="w-5 h-5 text-primary" />
          {t('pageTitle')}
        </h2>
        <p className="text-sm text-muted-fg mt-0.5">{t('pageSubtitle')}</p>
      </div>

      {/* P1-1 Onboarding: solo visible hasta completar u ocultar */}
      <OnboardingChecklist
        projectCount={dashboardData.length}
        hasAudit={dashboardData.some((p) => !!p.latestAudit)}
        setActiveTab={setActiveTab}
      />

      {/* ═══ 0. BIENVENIDA + RESUMEN RÁPIDO (Semana 5 — solo datos reales) ═══ */}
      <OverviewSummary
        userInitials={userInitials}
        projectCount={dashboardData.length}
        auditedCount={dashboardData.filter((p) => p.latestAudit != null).length}
        uptimePercent={hero.uptimePercent}
        failedChecks={hero.checks.filter((c) => c.isUp === false).length}
        checksLoading={hero.status === 'loading'}
        events={buildTimelineEvents({
          projects: dashboardData.map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt ?? null,
          })),
          failedChecks: hero.checks
            .filter((c) => c.isUp === false)
            .map((c) => ({ checkedAt: c.checkedAt, responseTimeMs: c.responseTimeMs })),
          projectAddedLabel: t('eventProjectAdded'),
          checkFailedLabel: t('eventCheckFailed'),
        })}
      />

      {/* ═══ 1. HERO CARD — telemetría real (últimos chequeos 24h) ═══ */}
      <Card variant="hero" className="p-6 sm:p-8 overflow-hidden">
        {/* Momento firma: barrido de encendido (1 vez al montar) */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          <div className="hero-scan absolute inset-y-0 left-0 w-1/3" />
        </div>
        {hero.status === 'loading' ? (
          <div aria-busy="true" aria-label={t('telemetry')}>
            <div className="flex items-center justify-between mb-5">
              <div className="h-4 w-40 rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted/30 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-28 rounded-xl bg-muted/20 animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl p-3.5 h-[76px] bg-muted/20 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        ) : hero.status === 'empty' ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted-fg" />
              <span className="text-2xs font-bold uppercase tracking-widest text-muted-fg">{t('offline')}</span>
            </span>
            <WifiOff aria-hidden="true" className="w-8 h-8 text-muted-fg" />
            <p className="font-display text-lg font-extrabold text-foreground tracking-tight">{t('heroNoDataTitle')}</p>
            <p className="text-sm text-muted-fg max-w-md">{t('heroNoDataDesc')}</p>
            <button
              onClick={() => setActiveTab('projects')}
              className="mt-2 text-2xs font-bold uppercase tracking-widest text-primary transition-colors flex items-center gap-1.5 group px-4 py-2 rounded-md border cursor-pointer"
              style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}
            >
              {t('heroNoDataCta')}
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-chartreuse" style={{ animation: 'pulse-beat 2s ease-in-out infinite' }} />
                  <span className="text-2xs font-bold uppercase tracking-widest text-chartreuse">{t('online')}</span>
                </span>
                <span className="w-0.5 h-3 bg-border" />
                <span className="text-2xs font-mono font-bold text-muted-fg">
                  SCAUDIT Engine
                </span>
              </div>
              <span className="text-2xs font-bold text-muted-fg flex items-center gap-1.5 font-mono">
                <Zap className="w-3 h-3 text-primary" />
                {hero.checks.length} {t('heroChecks')} · 24h
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Barras reales: últimos chequeos de uptime */}
              <div className="lg:col-span-2">
                <div className="flex items-end gap-1.5 h-20 mb-3" role="img" aria-label={`${hero.checks.length} ${t('heroChecks')}`}>
                  {[...hero.checks].reverse().map((c, i, arr) => {
                    const max = Math.max(...arr.map((x) => x.responseTimeMs ?? 0), 1);
                    const h = c.responseTimeMs != null ? Math.max(8, Math.round((c.responseTimeMs / max) * 100)) : 8;
                    return (
                      <div
                        key={i}
                        title={`${c.responseTimeMs ?? '—'}ms · ${new Date(c.checkedAt).toLocaleTimeString()}`}
                        className="flex-1 rounded-t-sm transition-opacity duration-300 hover:opacity-80"
                        style={{
                          height: `${h}%`,
                          background: c.isUp === false
                            ? 'oklch(55% 0.22 25 / 0.85)'
                            : 'oklch(68% 0.14 230 / 0.55)',
                        }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-2xs font-mono text-muted-fg">
                  <span>{hero.checks.length > 0 ? new Date([...hero.checks].reverse()[0]!.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  <span>{t('heroChecks')} · 24h</span>
                  <span>{t('online')}</span>
                </div>
              </div>

              {/* KPI stack — solo valores reales, "—" si no hay dato */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">{t('latency')}</span>
                  <span className="font-display text-xl font-extrabold text-foreground mt-0.5">
                    {hero.avgLatencyMs != null ? hero.avgLatencyMs : '—'}
                    {hero.avgLatencyMs != null && <span className="text-xs font-mono text-muted-fg ml-0.5">ms</span>}
                  </span>
                </div>
                <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">{t('uptime')}</span>
                  <span className="font-display text-xl font-extrabold text-foreground mt-0.5">
                    {hero.uptimePercent != null ? (hero.uptimePercent * 100).toFixed(1) : '—'}
                    {hero.uptimePercent != null && <span className="text-xs font-mono text-muted-fg ml-0.5">%</span>}
                  </span>
                </div>
                <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">{t('heroChecks')}</span>
                  <span className="font-display text-xl font-extrabold mt-0.5" style={{ color: 'var(--accent)' }}>
                    {hero.checks.length}
                    <span className="text-xs font-mono text-muted-fg ml-0.5">· 24h</span>
                  </span>
                </div>
                <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">{t('aiModels')}</span>
                  <span className="font-display text-xl font-extrabold text-foreground mt-0.5">
                    {hero.aiHealthy != null ? hero.aiHealthy : '—'}
                    {hero.aiHealthy != null && <span className="text-xs font-mono text-chartreuse ml-0.5">{t('activeLabel')}</span>}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ═══ 2. ASYMMETRIC BENTO: Chart + Terminal ═══ */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in motion-reduce:animate-none"
        style={{ animationDelay: '200ms' }}
      >

        {/* Chart area (2fr) */}
        <Card variant="elevation" className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Activity className="w-3.5 h-3.5 text-primary" />
                {t('telemetry')}
              </h3>
              <p className="text-sm font-bold text-foreground tracking-tight font-display">{t('avgLcpVsAudits')}</p>
              <p className="text-2xs text-muted-fg mt-0.5">Cuánto tarda en verse lo principal de tu página: menos segundos, mejor experiencia.</p>
            </div>
            <div className="flex items-center gap-3">
              <span title={t('previewBadge')} className="text-2xs font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border border-dashed border-muted-fg/40 text-muted-fg">
                {t('previewBadge')}
              </span>
              <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Auditorías
              </span>
              <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-chartreuse" />
                <JargonTerm term="LCP = lo que tarda en aparecer el contenido principal de tu página. Menos de 2,5 segundos es bueno.">
                  LCP (ms)
                </JargonTerm>
              </span>
            </div>
          </div>

          <div className="relative h-48 w-full border-b border-l" style={{ borderColor: 'oklch(15% 0.008 265 / 0.3)' }}>
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="gradientPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradientAccent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 25 H100 M0 50 H100 M0 75 H100" stroke="oklch(100% 0 0 / 0.02)" strokeWidth="0.5" fill="none" />
              <path d="M0 80 Q 10 70, 20 75 T 40 60 T 60 40 T 80 50 T 100 30" stroke="var(--primary)" strokeWidth="1.5" fill="none" />
              <path d="M0 80 Q 10 70, 20 75 T 40 60 T 60 40 T 80 50 T 100 30 L 100 100 L 0 100 Z" fill="url(#gradientPrimary)" />
              <path d="M0 60 Q 15 50, 30 65 T 50 45 T 70 55 T 90 35 T 100 40" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
              <path d="M0 60 Q 15 50, 30 65 T 50 45 T 70 55 T 90 35 T 100 40 L 100 100 L 0 100 Z" fill="url(#gradientAccent)" />
            </svg>
            <div className="absolute -bottom-6 w-full flex justify-between text-2xs font-bold text-muted-fg tracking-widest">
              <span>1 MAY</span>
              <span>8 MAY</span>
              <span>15 MAY</span>
              <span>22 MAY</span>
              <span>HOY</span>
            </div>
          </div>
        </Card>

        {/* Activity Terminal (1fr) */}
        <Card variant="elevation" className="p-6 flex flex-col">
          <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-4">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            {t('activityLog')}
          </h3>

          <div className="flex-1 font-mono text-2xs space-y-2.5 relative"
               style={{ background: 'oklch(2% 0.003 265)', borderRadius: '10px', border: '1px solid oklch(15% 0.008 265 / 0.15)', padding: '1rem' }}>
            {hero.status === 'loading' ? (
              <div className="space-y-2.5 animate-pulse" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-3.5 rounded bg-muted/30" style={{ width: `${85 - i * 12}%` }} />
                ))}
              </div>
            ) : hero.checks.length === 0 ? (
              <div className="text-muted-fg">{t('terminalEmpty')}</div>
            ) : (
              [...hero.checks].reverse().map((c, i) => (
                <div key={i} className={`flex gap-2.5 ${c.isUp === false ? 'text-destructive' : 'text-chartreuse'}`}>
                  <span className="text-muted-fg shrink-0">{new Date(c.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span>{c.isUp === false ? `[FAIL] Chequeo fallido` : `[OK] Chequeo completado${c.responseTimeMs != null ? ` (${c.responseTimeMs}ms)` : ''}`}</span>
                </div>
              ))
            )}
            <div className="flex items-center gap-2 text-muted-fg animate-pulse mt-3">
              <span className="w-1 h-3 bg-muted-fg block" />
              Listening...
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ 3. BENCHMARKING (lazy — recharts loads on scroll into view) ═══ */}
      <LazyBenchmarkingSection projectId={projectId} />

      {/* ═══ 3b. FORECAST 14 DÍAS (C-1; se oculta solo sin datos) ═══ */}
      <ForecastCard key={projectId ?? 'none'} projectId={projectId} />

      {/* ═══ 4. COMPLIANCE & TRUST BANNER ═══ */}
      <Card
        variant="elevation"
        className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 animate-fade-in motion-reduce:animate-none"
        style={{ animationDelay: '400ms' }}
      >
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full" style={{ background: 'oklch(68% 0.14 230 / 0.3)' }} />
        <div className="space-y-1.5 max-w-xl pl-4">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-extrabold text-primary uppercase tracking-wider flex items-center gap-1 px-2 py-0.5 rounded-md border" style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}>
              {t('enterprise')}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="text-2xs font-bold text-muted-fg tracking-widest uppercase">
              <JargonTerm term="GSC = Google Search Console: de dónde vienen tus visitas desde Google. Si está activo, usamos tus datos reales.">
                {t('gscSync')}
              </JargonTerm>
            </span>
          </div>
          <h4 className="font-display text-sm font-bold text-foreground tracking-tight">{t('intelligenceEngine')}</h4>
          <p className="text-xs text-muted-fg leading-relaxed">
            {t('engineDesc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl p-3" style={{ background: "var(--surface)", border: '1px solid oklch(15% 0.008 265 / 0.2)' }}>
          <div className="text-center px-4 py-1" style={{ borderRight: '1px solid oklch(15% 0.008 265 / 0.2)' }}>
            <p className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest">Compliance</p>
            <p className="text-xs font-bold text-foreground mt-0.5 font-display">SOC 2</p>
          </div>
          <div className="text-center px-4 py-1" style={{ borderRight: '1px solid oklch(15% 0.008 265 / 0.2)' }}>
            <p className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest">{t('standard')}</p>
            <p className="text-xs font-bold text-foreground mt-0.5 font-display">Lighthouse 12</p>
          </div>
          <div className="text-center px-4 py-1">
            <p className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest">{t('status')}</p>
            <p className="text-xs font-bold text-chartreuse mt-0.5 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t('secure')}
            </p>
          </div>
        </div>
      </Card>

      {/* ═══ 4. RECENT PROJECTS GRID ═══ */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'oklch(15% 0.008 265 / 0.2)' }}>
          <div>
            <h2 className="font-display text-lg font-extrabold tracking-tight text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              {t('monitoringNodes')}
            </h2>
            <p className="text-xs text-muted-fg mt-1 font-medium">{t('healthDesc')}</p>
          </div>
          <button 
            onClick={() => setActiveTab('projects')}
            className="text-2xs font-bold uppercase tracking-widest text-primary transition-colors flex items-center gap-1.5 group px-3 py-1.5 rounded-md border" 
            style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}
          >
            {t('exploreNetwork')}
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {dashboardData.length === 0 ? (
            <div className="lg:col-span-2">
              <EmptyState
                icon={<Globe aria-hidden="true" className="w-8 h-8" />}
                title={t('projectsEmptyTitle')}
                description={t('projectsEmptyDesc')}
                action={
                  <button
                    onClick={() => setActiveTab('projects')}
                    className="text-2xs font-bold uppercase tracking-widest text-primary transition-colors inline-flex items-center gap-1.5 group px-4 py-2 rounded-md border cursor-pointer"
                    style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}
                  >
                    {t('projectsEmptyCta')}
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                }
              />
            </div>
          ) : (
            dashboardData.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
