'use client';

/**
 * PortfolioTab — Vista de portafolio (B2 + B5 + B9).
 *
 * El resto del dashboard juzga un proyecto a la vez. Esta vista contesta la
 * pregunta de dirección: "¿cómo estamos en total, qué proyecto está peor y
 * vamos a mejor o a peor?".
 *
 * Dos reglas de honestidad atraviesan el componente, y vienen del servidor:
 *   · `corporateScore === null` se muestra como "sin datos", nunca como 0.
 *   · Los buckets sin mediciones se omiten del gráfico en vez de pintarse
 *     como cero: un hueco y un cero se leen igual y significan lo contrario.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  Gauge,
  Timer,
  ShieldAlert,
  Eye,
  Loader2,
  Activity,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';

interface PortfolioProject {
  id: string;
  name: string;
  domain: string;
  healthScore: number | null;
  criticalIssues: number;
  warningIssues: number;
  openFindings: number;
  openCritical: number;
  closedFindings: number;
  mttrHours: number | null;
  lastAuditAt: string | null;
}

interface PortfolioResponse {
  success: boolean;
  portfolio: {
    corporateScore: number | null;
    projectCount: number;
    projectsWithoutData: number;
    totalCriticalIssues: number;
    totalWarningIssues: number;
    totalOpenFindings: number;
    totalOpenCritical: number;
    mttrHours: number | null;
    worstProjects: PortfolioProject[];
    projects: PortfolioProject[];
    openBySeverity: Record<string, number>;
  };
}

interface TrendPoint {
  bucketStart: string;
  audits: number;
  score: number | null;
  criticalIssues: number;
  warningIssues: number;
  resolved: number;
  mttrHours: number | null;
}

interface TrendsResponse {
  success: boolean;
  trends: {
    points: TrendPoint[];
    latestScore: number | null;
    scoreDelta: number | null;
    direction: 'up' | 'down' | 'flat' | 'unknown';
    resolvedInWindow: number;
    stillOpen: number;
    uptimePct: number | null;
  };
}

interface PurpleResponse {
  success: boolean;
  purple: {
    current: {
      detectionScore: number | null;
      missRate: number | null;
      evaluated: number;
      exposed: number;
      protected: number;
      manualOnly: number;
      blindSpots: string[];
    };
    deltaPoints: number | null;
    direction: 'up' | 'down' | 'flat' | 'unknown';
    hasPreviousData: boolean;
  };
}

const BUCKETS = ['day', 'week', 'month'] as const;
type Bucket = (typeof BUCKETS)[number];

interface PortfolioTabProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

/**
 * Score → tono. Reutiliza las clases de severidad ya presentes en el tema en
 * lugar de inventar un token por cada valor.
 */
function scoreTone(score: number | null): string {
  if (score === null) return 'text-muted-fg';
  if (score >= 80) return 'text-chart-success';
  if (score >= 50) return 'text-chart-warning';
  return 'text-chart-danger';
}

/** Línea de tendencia: solo puntos con score; los huecos no se rellenan. */
function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const scored = points.filter((p) => p.score !== null);
  if (scored.length < 2) return null;

  const w = 320;
  const h = 64;
  const step = w / Math.max(scored.length - 1, 1);
  const path = scored
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p.score! / 100) * h).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-16 w-full"
      role="img"
      aria-label={`${scored.length} puntos de score de salud`}
    >
      <path d={path} fill="none" stroke="var(--chart-primary)" strokeWidth="2" strokeLinejoin="round" />
      {scored.map((p, i) => (
        <circle
          key={p.bucketStart}
          cx={(i * step).toFixed(1)}
          cy={(h - (p.score! / 100) * h).toFixed(1)}
          r="2.5"
          fill="var(--chart-primary)"
        />
      ))}
    </svg>
  );
}

export function PortfolioTab({ projects, selectedProjectId, setSelectedProjectId }: PortfolioTabProps) {
  const t = useTranslations('portfolio');

  const [portfolio, setPortfolio] = useState<PortfolioResponse['portfolio'] | null>(null);
  const [trends, setTrends] = useState<TrendsResponse['trends'] | null>(null);
  const [purple, setPurple] = useState<PurpleResponse['purple'] | null>(null);
  // Proyecto+token ya cargados: el estado de carga se deriva en vez de
  // setearse dentro del efecto (react-hooks/set-state-in-effect).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [bucket, setBucket] = useState<Bucket>('week');
  const [bucketLoaded, setBucketLoaded] = useState<Bucket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLoading =
    selectedProjectId !== "" && (loadedFor !== selectedProjectId || bucketLoaded !== bucket);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Sin proyecto seleccionado solo tiene sentido el roll-up de cartera:
        // las series y el purple score son por proyecto. Antes se hacía
        // `return` temprano, lo que dejaba el tab girando para siempre sin
        // proyecto — el `finally` nunca corría y el estado de carga no
        // terminaba nunca. Ahora se cargan las fuentes que apliquen y la
        // carga se cierra igual.
        const projectScoped = selectedProjectId
          ? Promise.all([
              fetch(
                `/api/portfolio/trends?projectId=${selectedProjectId}&bucket=${bucket}&window=12`,
              ),
              fetch(`/api/portfolio/purple-score?projectId=${selectedProjectId}&days=90`),
            ])
          : Promise.resolve([null, null] as const);

        // `projectScoped` resuelve a un PAR, y Promise.all no lo aplana: hay
        // que desenvolverlo o `tRes` sería el array entero y su `.json()`
        // reventaría al no ser una respuesta.
        const [pRes, scoped] = await Promise.all([
          fetch('/api/portfolio'),
          projectScoped,
        ]);
        const [tRes, purpleRes] = scoped as [Response | null, Response | null];

        const [pData, tData, purpleData] = (await Promise.all([
          pRes.json(),
          tRes ? tRes.json() : Promise.resolve(null),
          purpleRes ? purpleRes.json() : Promise.resolve(null),
        ])) as [
          PortfolioResponse & { error?: string },
          (TrendsResponse & { error?: string }) | null,
          (PurpleResponse & { error?: string }) | null,
        ];

        if (!active) return;
        const failed = [pData, tData, purpleData].find((d) => d !== null && !d.success);
        if (failed) {
          setError((failed as { error?: string }).error ?? t('loadError'));
        } else {
          setPortfolio(pData.portfolio);
          // Sin proyecto no hay serie que enseñar: se limpian para que no
          // quede el dato del proyecto anterior colgado en pantalla.
          setTrends(tData?.trends ?? null);
          setPurple(purpleData?.purple ?? null);
          setError(null);
        }
      } catch (err) {
        logger.error('Failed to fetch portfolio:', err);
        if (active) setError(t('loadError'));
      } finally {
        if (active) {
          setLoadedFor(selectedProjectId);
          setBucketLoaded(bucket);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedProjectId, bucket, reloadToken, t]);

  const scoreDeltaNode = useMemo(() => {
    if (!trends || trends.scoreDelta === null) {
      return (
        <span className="inline-flex items-center gap-1 text-2xs text-muted-fg">
          <Minus size={12} aria-hidden="true" />
          {t('noTrend')}
        </span>
      );
    }
    const Icon = trends.direction === 'up' ? TrendingUp : trends.direction === 'down' ? TrendingDown : Minus;
    return (
      <span
        className={`inline-flex items-center gap-1 text-2xs font-semibold ${
          trends.direction === 'up'
            ? 'text-chart-success'
            : trends.direction === 'down'
              ? 'text-chart-danger'
              : 'text-muted-fg'
        }`}
      >
        <Icon size={12} aria-hidden="true" />
        {trends.scoreDelta > 0 ? '+' : ''}
        {trends.scoreDelta}
      </span>
    );
  }, [trends, t]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-fg" aria-busy="true">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        {t('loading')}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title={t('errorTitle')}
        description={t('errorDescription')}
        detail={error}
        onRetry={() => setReloadToken((n) => n + 1)}
      />
    );
  }

  if (!portfolio) return null;

  const hasProjects = portfolio.projectCount > 0;

  return (
    <div className="space-y-6">
      {/* ── Resumen ejecutivo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-fg">
            <Gauge size={13} aria-hidden="true" />
            {t('corporateScore')}
          </div>
          {portfolio.corporateScore === null ? (
            <p className="mt-2 text-sm text-muted-fg">{t('noData')}</p>
          ) : (
            <p className={`mt-1 text-3xl font-bold font-mono ${scoreTone(portfolio.corporateScore)}`}>
              {portfolio.corporateScore}
              <span className="text-base text-muted-fg">/100</span>
            </p>
          )}
          <p className="mt-1 text-2xs text-muted-fg">
            {portfolio.projectsWithoutData > 0
              ? t('projectsWithoutData', { count: portfolio.projectsWithoutData })
              : t('projectsScored', { count: portfolio.projectCount })}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-fg">
            <ShieldAlert size={13} aria-hidden="true" />
            {t('openCritical')}
          </div>
          <p className={`mt-1 text-3xl font-bold font-mono ${portfolio.totalOpenCritical > 0 ? 'text-chart-danger' : 'text-chart-success'}`}>
            {portfolio.totalOpenCritical}
          </p>
          <p className="mt-1 text-2xs text-muted-fg">
            {t('openTotal', { count: portfolio.totalOpenFindings })}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-fg">
            <Timer size={13} aria-hidden="true" />
            {t('mttr')}
          </div>
          {portfolio.mttrHours === null ? (
            <p className="mt-2 text-sm text-muted-fg">{t('noClosures')}</p>
          ) : (
            <p className="mt-1 text-3xl font-bold font-mono text-foreground">
              {portfolio.mttrHours}
              <span className="text-base text-muted-fg">h</span>
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-fg">
            <Activity size={13} aria-hidden="true" />
            {t('trendTitle')}
          </div>
          <p className={`mt-1 text-3xl font-bold font-mono ${scoreTone(trends?.latestScore ?? null)}`}>
            {trends?.latestScore ?? '—'}
            {trends?.latestScore !== null && trends?.latestScore !== undefined ? (
              <span className="text-base text-muted-fg">/100</span>
            ) : null}
          </p>
          <div className="mt-1">{scoreDeltaNode}</div>
        </Card>
      </div>

      {!hasProjects ? (
        <EmptyState icon={<Building2 />} title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <>
          {/* ── Series temporales (B9) ────────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('trendTitle')}</h3>
                <p className="text-2xs text-muted-fg">{t('trendDescription')}</p>
              </div>
              <div
                className="flex gap-1 rounded-lg border border-border p-0.5"
                role="group"
                aria-label={t('bucketLabel')}
              >
                {BUCKETS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBucket(b)}
                    aria-pressed={bucket === b}
                    className={`rounded px-2.5 py-1 text-2xs font-semibold transition-colors ${
                      bucket === b
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-fg hover:text-foreground'
                    }`}
                  >
                    {t(`buckets.${b}`)}
                  </button>
                ))}
              </div>
            </div>

            {trends && trends.points.length > 0 ? (
              <div className="mt-4 space-y-3">
                {trends.points.every((p) => p.score === null) ? (
                  <p className="text-sm text-muted-fg">{t('noTrendData')}</p>
                ) : (
                  <ScoreTrend points={trends.points} />
                )}
                <div className="flex flex-wrap gap-4 text-2xs text-muted-fg">
                  <span>
                    {t('resolvedInWindow')}: <strong className="text-foreground font-mono">{trends?.resolvedInWindow ?? 0}</strong>
                  </span>
                  <span>
                    {t('stillOpen')}: <strong className="text-foreground font-mono">{trends?.stillOpen ?? 0}</strong>
                  </span>
                  {trends?.uptimePct != null && (
                    <span>
                      {t('uptime')}: <strong className="text-foreground font-mono">{trends.uptimePct}%</strong>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-fg">{t('noTrendData')}</p>
            )}
          </Card>

          {/* ── Purple team (B5) ─────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Eye size={15} aria-hidden="true" className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{t('purpleTitle')}</h3>
            </div>
            <p className="text-2xs text-muted-fg">{t('purpleDescription')}</p>

            {purple && purple.current.evaluated > 0 ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-muted-fg">{t('purpleScore')}</p>
                    <p className="text-2xl font-bold font-mono text-foreground">
                      {purple.current.detectionScore !== null ? `${purple.current.detectionScore}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-muted-fg">{t('purpleMissRate')}</p>
                    <p className="text-2xl font-bold font-mono text-foreground">
                      {purple.current.missRate !== null ? `${purple.current.missRate}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs uppercase tracking-wider text-muted-fg">{t('purpleExposed')}</p>
                    <p className="text-2xl font-bold font-mono text-chart-danger">{purple.current.exposed}</p>
                  </div>
                  {purple.deltaPoints !== null && (
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-muted-fg">{t('purpleDelta')}</p>
                      <p className="text-2xl font-bold font-mono text-foreground">
                        {purple.deltaPoints > 0 ? '+' : ''}
                        {purple.deltaPoints}
                      </p>
                    </div>
                  )}
                </div>
                {purple.current.blindSpots.length > 0 && (
                  <div className="rounded-lg border border-chart-warning/30 bg-chart-warning/5 px-3 py-2">
                    <p className="text-2xs font-semibold text-chart-warning">
                      {t('blindSpots', { count: purple.current.blindSpots.length })}
                    </p>
                    <p className="mt-0.5 font-mono text-2xs text-muted-fg">
                      {purple.current.blindSpots.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-fg">{t('purpleEmpty')}</p>
            )}
          </Card>

          {/* ── Peor postura (B2) ────────────────────────────────────────── */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground">{t('worstTitle')}</h3>
            <p className="text-2xs text-muted-fg">{t('worstDescription')}</p>

            {portfolio.worstProjects.length === 0 ? (
              <p className="mt-3 text-sm text-muted-fg">{t('noScoredProjects')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {portfolio.worstProjects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className={`text-lg font-bold font-mono ${scoreTone(p.healthScore)}`}>
                      {p.healthScore}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{p.name}</p>
                      <p className="truncate font-mono text-2xs text-muted-fg">{p.domain}</p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-2xs text-muted-fg">
                      {p.criticalIssues > 0 && (
                        <span className="text-chart-danger">
                          {p.criticalIssues} {t('criticalShort')}
                        </span>
                      )}
                      {p.warningIssues > 0 && <span>{p.warningIssues} {t('warningShort')}</span>}
                      {p.openCritical > 0 && (
                        <span className="text-chart-danger">
                          {p.openCritical} {t('findingsShort')}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(p.id)}
                      className="shrink-0 rounded border border-border px-2 py-1 text-2xs text-muted-fg transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      {t('open')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* Selector de proyecto (reutiliza el que ya maneja el contenedor) */}
      <label className="flex items-center gap-2 text-2xs text-muted-fg">
        {t('projectLabel')}
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default PortfolioTab;