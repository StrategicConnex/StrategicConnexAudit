'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Globe, ChevronRight, Activity,
  Terminal, CheckCircle2, Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProjectCard } from '../ProjectCard';
import { Card } from '@/components/ui/Card';
import type { ProjectWithNested } from '@/shared/db/types';

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
}

export function OverviewTab({ dashboardData, setActiveTab, projectId }: OverviewTabProps) {
  const t = useTranslations('overview');
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

      {/* ═══ 1. HERO CARD — Full-width live monitoring ═══ */}
      <Card variant="hero" className="p-6 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-chartreuse" style={{ animation: 'pulse-beat 2s ease-in-out infinite' }} />
              <span className="text-2xs font-bold uppercase tracking-widest text-chartreuse">Online</span>
            </span>
            <span className="w-0.5 h-3 bg-border" />
            <span className="text-2xs font-mono font-bold text-muted-fg">
              SCAUDIT Engine
            </span>
          </div>
          <span className="text-2xs font-bold text-muted-fg flex items-center gap-1.5 font-mono">
            <Zap className="w-3 h-3 text-primary" />
            1,247 req/s
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Heartbeat bar chart */}
          <div className="lg:col-span-2">
            <div className="flex items-end gap-[3px] h-20 mb-3">
              {[35, 42, 58, 63, 48, 72, 85, 68, 52, 44,
                38, 55, 61, 78, 92, 88, 74, 56, 48, 62,
                70, 84, 76, 58, 45, 52, 68, 82, 95, 78].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-opacity duration-300 hover:opacity-80"
                  style={{
                    height: `${h}%`,
                    background: i === 28
                      ? 'oklch(78% 0.18 140 / 0.9)'
                      : i > 25
                      ? 'oklch(68% 0.14 230 / 0.7)'
                      : 'oklch(68% 0.14 230 / 0.35)',
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-2xs font-mono text-muted-fg">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>Ahora</span>
            </div>
          </div>

          {/* KPI stack */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">Latencia</span>
              <span className="font-display text-xl font-extrabold text-foreground mt-0.5">1.8<span className="text-xs font-mono text-muted-fg ml-0.5">ms</span></span>
            </div>
            <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">Uptime</span>
              <span className="font-display text-xl font-extrabold text-foreground mt-0.5">127<span className="text-xs font-mono text-muted-fg ml-0.5">d</span></span>
            </div>
            <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">SLA</span>
              <span className="font-display text-xl font-extrabold mt-0.5" style={{ color: 'var(--accent)' }}>99.9<span className="text-xs font-mono text-muted-fg ml-0.5">%</span></span>
            </div>
            <div className="rounded-xl p-3.5 flex flex-col justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="text-2xs uppercase tracking-widest font-bold text-muted-fg">Modelos IA</span>
              <span className="font-display text-xl font-extrabold text-foreground mt-0.5">3<span className="text-xs font-mono text-chartreuse ml-0.5">activos</span></span>
            </div>
          </div>
        </div>
      </Card>

      {/* ═══ 2. ASYMMETRIC BENTO: Chart + Terminal ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Chart area (2fr) */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Activity className="w-3.5 h-3.5 text-primary" />
                {t('telemetry')}
              </h3>
              <p className="text-sm font-bold text-foreground tracking-tight font-display">{t('avgLcpVsAudits')}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-primary" />
                Auditorías
              </span>
              <span className="flex items-center gap-1.5 text-2xs font-bold text-muted-fg uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-chartreuse" />
                LCP (ms)
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
        <Card className="p-6 flex flex-col">
          <h3 className="text-2xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5 mb-4">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            {t('activityLog')}
          </h3>

          <div className="flex-1 font-mono text-2xs space-y-2.5 relative"
               style={{ background: 'oklch(2% 0.003 265)', borderRadius: '10px', border: '1px solid oklch(15% 0.008 265 / 0.15)', padding: '1rem' }}>
            <div className="flex gap-2.5 text-chartreuse">
              <span className="text-muted-fg shrink-0">18:42:01</span>
              <span>[OK] Crawl complete for domain-a.com (2.4s)</span>
            </div>
            <div className="flex gap-2.5 text-destructive">
              <span className="text-muted-fg shrink-0">18:40:15</span>
              <span>[WARN] CLS threshold exceeded (0.24)</span>
            </div>
            <div className="flex gap-2.5 text-primary">
              <span className="text-muted-fg shrink-0">18:35:50</span>
              <span>[INFO] Syncing GSC data for 12 properties...</span>
            </div>
            <div className="flex gap-2.5 text-chartreuse">
              <span className="text-muted-fg shrink-0">18:35:54</span>
              <span>[OK] GSC Sync complete.</span>
            </div>
            <div className="flex gap-2.5 text-muted-fg">
              <span className="text-muted-fg shrink-0">18:30:00</span>
              <span>[SYS] Automated audit cycle initiated.</span>
            </div>
            <div className="flex items-center gap-2 text-muted-fg animate-pulse mt-3">
              <span className="w-1 h-3 bg-muted-fg block" />
              Listening...
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ 3. BENCHMARKING (lazy — recharts loads on scroll into view) ═══ */}
      <LazyBenchmarkingSection projectId={projectId} />

      {/* ═══ 4. COMPLIANCE & TRUST BANNER ═══ */}
      <Card className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full" style={{ background: 'oklch(68% 0.14 230 / 0.3)' }} />
        <div className="space-y-1.5 max-w-xl pl-4">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-extrabold text-primary uppercase tracking-wider flex items-center gap-1 px-2 py-0.5 rounded-md border" style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}>
              {t('enterprise')}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="text-2xs font-bold text-muted-fg tracking-widest uppercase">GSC API Sync Active</span>
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
          {dashboardData.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}
