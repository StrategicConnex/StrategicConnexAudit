'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MitreRealCoverage } from '@/features/dashboard/tabs/MitreRealCoverage';

export interface MitreProjectOption {
  id: string;
  name: string;
  domain?: string | null;
}

/**
 * Sección "Cobertura Real" para la página /mitre-coverage:
 * selector de proyecto + motor MITRE real compartido con el tab Adversario.
 */
export function MitreRealSection({ projects }: { projects: MitreProjectOption[] }) {
  const t = useTranslations('adversaryReal');
  const [selectedId, setSelectedId] = useState(projects[0]?.id ?? '');

  if (projects.length === 0) {
    return (
      <div className="glass-card p-6 text-xs text-muted-fg">
        {t('emptyProjects')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{t('realHeading')}</h2>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{t('projectLabel')}</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="bg-muted border border-border hover:border-primary/20 text-foreground text-xs font-bold rounded-xl py-2 px-3 outline-none cursor-pointer appearance-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.domain ? ` (${p.domain})` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedId && <MitreRealCoverage projectId={selectedId} />}
    </div>
  );
}
