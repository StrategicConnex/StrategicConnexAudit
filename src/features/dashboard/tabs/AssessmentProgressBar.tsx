'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

/**
 * Barra de progreso en vivo para evaluaciones (assessment / MITRE).
 * El porcentaje se deriva del estado + checks completados que la UI
 * recibe por polling de la fila en BD.
 */
export function AssessmentProgressBar({
  status,
  checksDone,
  checksTotal,
  currentStep,
}: {
  status: string;
  checksDone: number;
  checksTotal: number;
  currentStep: string | null;
}) {
  const t = useTranslations('adversaryReal');

  let percent: number;
  if (status === 'completed') percent = 100;
  else if (status === 'analyzing') percent = 85;
  else if (status === 'pending') percent = 5;
  else if (checksTotal > 0) percent = Math.min(80, 10 + Math.round((checksDone / checksTotal) * 70));
  else percent = 10;

  const stepLabel =
    status === 'analyzing'
      ? t('progressAI')
      : status === 'pending'
        ? t('progressStarting')
        : currentStep
          ? t('progressCurrent', { step: currentStep })
          : t('progressStarting');

  const countsLabel =
    checksTotal > 0 ? t('progressChecksDone', { done: Math.min(checksDone, checksTotal), total: checksTotal }) : null;

  return (
    <div className="space-y-2">
      <div
        className="h-2 w-full rounded-full bg-muted/20 overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-2xs text-foreground/80 font-bold truncate">{stepLabel}</span>
        <span className="text-2xs text-muted-fg font-mono shrink-0">
          {countsLabel ? `${countsLabel} · ` : ''}{percent}%
        </span>
      </div>
    </div>
  );
}
