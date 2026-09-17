'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface ForecastRow {
  metric: string;
  current: number;
  predicted: number;
  horizonDays: number;
  confidence: number;
  trend: string;
}

const METRIC_LABEL: Record<string, string> = {
  latency_ms: 'Latencia',
  uptime_risk: 'Riesgo de caída',
  keyword_position: 'Posición media',
};

const METRIC_UNIT: Record<string, string> = {
  latency_ms: 'ms',
  uptime_risk: '% días con caídas',
  keyword_position: '#',
};

/**
 * ForecastCard — "en 14 días" a partir del histórico (C-1).
 * Honesto: muestra la confianza (R²) y se oculta sin datos del job semanal.
 */
export function ForecastCard({ projectId }: { projectId?: string }) {
  const t = useTranslations('overview');
  const [rows, setRows] = useState<ForecastRow[] | null>(null);

  useEffect(() => {
    if (!projectId) {
      setRows(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/forecast?projectId=${projectId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.success && Array.isArray(data.forecasts) && data.forecasts.length > 0) {
          setRows(data.forecasts);
        } else {
          setRows(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!rows) return null;

  const fmt = (m: string, v: number) =>
    m === 'keyword_position' || m === 'latency_ms'
      ? `${Math.round(v * 10) / 10}${METRIC_UNIT[m] ?? ''}`
      : `${(Math.round(v * 1000) / 10).toFixed(1)}%`;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles aria-hidden="true" className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-extrabold tracking-tight text-foreground">
          {t('forecastTitle')}
        </h3>
      </div>
      <p className="text-2xs text-muted-fg mb-4">{t('forecastDesc')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rows.map((r) => (
          <div key={r.metric} className="rounded-xl border border-border bg-muted/10 p-4">
            <p className="text-2xs font-bold text-muted-fg uppercase tracking-widest">
              {METRIC_LABEL[r.metric] ?? r.metric}
            </p>
            <p className="mt-1 text-lg font-extrabold tracking-tight text-foreground">
              {fmt(r.metric, r.predicted)}{' '}
              <span className="text-2xs font-bold text-muted-fg">/ {t('forecastInDays', { days: r.horizonDays })}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-2xs text-muted-fg">
              {r.trend === 'up' ? (
                <TrendingUp aria-hidden="true" className="w-3.5 h-3.5 text-chart-warning" />
              ) : r.trend === 'down' ? (
                <TrendingDown aria-hidden="true" className="w-3.5 h-3.5 text-chartreuse" />
              ) : (
                <Minus aria-hidden="true" className="w-3.5 h-3.5" />
              )}
              {t('forecastNow')}: {fmt(r.metric, r.current)} · {t('forecastConfidence')}: {Math.round(r.confidence * 100)}%
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
