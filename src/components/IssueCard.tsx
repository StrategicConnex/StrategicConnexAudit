'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  CheckCircle2,
  EyeOff,
  Loader2,
  Link2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { calculateImpactScore } from '@/components/issue-impact';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT IssueCard — hallazgo expandible: severidad, score de impacto,
   página afectada, recomendación y acciones (resolver/reabrir/ignorar).
   Semana 8 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface IssueItem {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  recommendation: string | null;
  url: string | null;
  fixed: boolean | null;
}

const SEVERITY = {
  critical: { label: 'Crítico', variant: 'critical' as const, Icon: AlertCircle },
  warning: { label: 'Aviso', variant: 'warning' as const, Icon: AlertTriangle },
  info: { label: 'Info', variant: 'info' as const, Icon: Info },
} as const;

export function IssueCard({
  issue,
  fixed,
  fixedPending,
  defaultExpanded = false,
  onToggleFixed,
  onIgnore,
}: {
  issue: IssueItem;
  fixed: boolean;
  fixedPending: boolean;
  defaultExpanded?: boolean;
  onToggleFixed: () => void;
  onIgnore: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sev = SEVERITY[issue.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
  const impact = calculateImpactScore(issue);
  const bodyId = `issue-${issue.id}-body`;

  return (
    <Card className={cn('overflow-hidden', fixed && 'opacity-60')}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-muted/20 sm:gap-4 sm:p-5"
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl border',
            issue.severity === 'critical'
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : issue.severity === 'warning'
                ? 'border-corporate-warning/20 bg-corporate-warning/10 text-corporate-warning'
                : 'border-corporate-primary-light/20 bg-corporate-primary-light/10 text-corporate-primary-light',
          )}
        >
          <sev.Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">
            {issue.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={sev.variant}>{sev.label}</Badge>
            <Badge variant="neutral">
              Impacto {impact.score}/100
            </Badge>
            {fixed && <Badge variant="success">Resuelto</Badge>}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-muted-fg transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div id={bodyId} className="space-y-4 border-t border-border px-4 py-4 sm:px-5">
          <p className="flex items-start gap-2 text-xs text-muted-fg">
            <Link2 size={14} className="mt-0.5 shrink-0" />
            <span className="break-all font-mono">
              {issue.url ?? 'Página no registrada'}
            </span>
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {issue.description}
          </p>
          {issue.recommendation && (
            <div className="rounded-xl border-l-[3px] border-corporate-primary-light bg-corporate-primary-light/10 p-4 text-left">
              <p className="text-2xs font-extrabold uppercase tracking-widest text-corporate-primary-light">
                Plan de acción
              </p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-foreground/90">
                {issue.recommendation}
              </p>
            </div>
          )}
          <dl className="grid grid-cols-3 gap-2">
            {[
              ['Prioridad', impact.urgency],
              ['Dificultad', impact.difficulty],
              ['Retorno', impact.roi],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/20 px-2 py-2 text-center"
              >
                <dt className="text-2xs font-bold uppercase tracking-wider text-muted-fg">
                  {k}
                </dt>
                <dd className="text-xs font-bold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleFixed}
              disabled={fixedPending}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-2xs font-extrabold uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50',
                fixed
                  ? 'border-border text-muted-fg hover:text-foreground hover:border-primary/30'
                  : 'border-corporate-success/30 bg-corporate-success/10 text-corporate-success hover:bg-corporate-success/20',
              )}
            >
              {fixedPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              {fixed ? 'Reabrir' : 'Marcar resuelto'}
            </button>
            {!fixed && (
              <button
                type="button"
                onClick={onIgnore}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-2xs font-extrabold uppercase tracking-widest text-muted-fg transition-colors hover:text-foreground cursor-pointer"
              >
                <EyeOff size={13} />
                Ignorar
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
