'use client';

import { useState } from 'react';
import { Check, ListChecks, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';

interface OnboardingChecklistProps {
  projectCount: number;
  hasAudit: boolean;
  setActiveTab: (tab: string) => void;
}

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Sin almacenamiento: el checklist simplemente reaparece. No bloquea nada.
  }
}

/**
 * Onboarding P1-1: 3 pasos (proyecto → escaneo → informe). Solo visible hasta
 * completar u ocultar; el progreso vive en localStorage por usuario/navegador.
 */
export function OnboardingChecklist({ projectCount, hasAudit, setActiveTab }: OnboardingChecklistProps) {
  const t = useTranslations('overview');
  const [dismissed, setDismissed] = useState(() => readFlag('saudit-onboarding-dismissed'));
  const [sawReports, setSawReports] = useState(() => readFlag('saudit-onboarding-reports'));

  const steps = [
    {
      done: projectCount > 0,
      title: t('onboarding.step1'),
      hint: t('onboarding.step1Hint'),
      cta: t('onboarding.step1Cta'),
      tab: 'projects',
    },
    {
      done: hasAudit,
      title: t('onboarding.step2'),
      hint: t('onboarding.step2Hint'),
      cta: t('onboarding.step2Cta'),
      tab: 'intelligence',
    },
    {
      done: sawReports,
      title: t('onboarding.step3'),
      hint: t('onboarding.step3Hint'),
      cta: t('onboarding.step3Cta'),
      tab: 'reports',
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || doneCount === steps.length) return null;

  const go = (tab: string) => {
    if (tab === 'reports') {
      setSawReports(true);
      writeFlag('saudit-onboarding-reports');
    }
    setActiveTab(tab);
  };

  const dismiss = () => {
    setDismissed(true);
    writeFlag('saudit-onboarding-dismissed');
  };

  return (
    <Card className="p-5 sm:p-6 relative overflow-hidden" role="region" aria-label={t('onboarding.title')}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <ListChecks aria-hidden="true" className="w-4 h-4 text-primary" />
          {t('onboarding.title')} · {doneCount}/3
        </h3>
        <button
          onClick={dismiss}
          aria-label={t('onboarding.dismiss')}
          title={t('onboarding.dismiss')}
          className="p-1.5 rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                s.done ? 'bg-chartreuse/15 border-chartreuse/40 text-chartreuse' : 'border-border text-muted-fg'
              }`}
            >
              {s.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground tracking-tight">{s.title}</p>
              {!s.done && <p className="text-2xs text-muted-fg">{s.hint}</p>}
            </div>
            {!s.done && (
              <button
                onClick={() => go(s.tab)}
                className="shrink-0 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/20 transition-colors cursor-pointer"
              >
                {s.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
