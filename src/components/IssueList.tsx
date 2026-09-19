'use client';

import { useMemo, useState } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { IssueCard, type IssueItem } from '@/components/IssueCard';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectPositioner,
  SelectPopup,
  SelectList,
  SelectItem,
} from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT IssueList — hallazgos con búsqueda, filtros por severidad y
   categoría, y acciones por item (resolver persiste en BD; ignorar es
   local a la sesión). Semana 8 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

const SEVERITIES = [
  { value: 'all', label: 'Todos' },
  { value: 'critical', label: 'Críticos' },
  { value: 'warning', label: 'Avisos' },
  { value: 'info', label: 'Info' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todas las categorías',
  meta: 'Metadatos',
  seo: 'SEO técnico',
  performance: 'Rendimiento',
  link: 'Enlaces',
  accessibility: 'Accesibilidad',
  security: 'Seguridad',
};

export function IssueList({
  issues,
  onToggleFixed,
}: {
  issues: IssueItem[];
  /** Server action directa: recibe el objeto validado por zod. */
  onToggleFixed: (input: {
    issueId: string;
    fixed: boolean;
  }) => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [fixedMap, setFixedMap] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const q = query.toLowerCase().trim();
  const visible = useMemo(
    () =>
      issues.filter((i) => {
        if (ignored.includes(i.id)) return false;
        if (severity !== 'all' && i.severity !== severity) return false;
        if (category !== 'all' && i.category !== category) return false;
        if (
          q !== '' &&
          !`${i.title} ${i.description} ${i.url ?? ''}`.toLowerCase().includes(q)
        )
          return false;
        return true;
      }),
    [issues, ignored, severity, category, q],
  );

  const criticalCount = issues.filter(
    (i) => i.severity === 'critical' && !ignored.includes(i.id),
  ).length;

  const handleToggleFixed = async (id: string, next: boolean) => {
    setPendingId(id);
    try {
      const res = (await onToggleFixed({ issueId: id, fixed: next })) as {
        data?: { success?: boolean };
      } | null;
      if (res?.data?.success) {
        setFixedMap((m) => ({ ...m, [id]: next }));
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg"
          />
          <span className="sr-only">Buscar hallazgos</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, descripción o URL…"
            className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-fg/60 focus:border-primary/40 focus:outline-none transition-colors"
          />
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Filtrar por severidad">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={severity === s.value}
              onClick={() => setSeverity(s.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-2xs font-extrabold uppercase tracking-widest transition-colors cursor-pointer',
                severity === s.value
                  ? 'border-corporate-primary/40 bg-corporate-primary/10 text-foreground'
                  : 'border-border text-muted-fg hover:text-foreground hover:border-primary/30',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as string)}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectPortal>
            <SelectPositioner>
              <SelectPopup>
                <SelectList>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectList>
              </SelectPopup>
            </SelectPositioner>
          </SelectPortal>
        </Select>
      </div>

      <p className="text-2xs font-bold uppercase tracking-widest text-muted-fg" role="status">
        {visible.length} hallazgos
        {criticalCount > 0 && ` · ${criticalCount} críticos`}
        {ignored.length > 0 && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => setIgnored([])}
              className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline"
            >
              <RotateCcw size={11} />
              Mostrar {ignored.length} ignorados
            </button>
          </>
        )}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Search size={20} />}
          title="Sin hallazgos con estos filtros"
          description="Ajusta la búsqueda o restablece los filtros para ver más resultados."
          className="py-10"
        />
      ) : (
        <div className="space-y-3">
          {visible.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              fixed={fixedMap[issue.id] ?? issue.fixed ?? false}
              fixedPending={pendingId === issue.id}
              onToggleFixed={() =>
                handleToggleFixed(
                  issue.id,
                  !(fixedMap[issue.id] ?? issue.fixed ?? false),
                )
              }
              onIgnore={() => setIgnored((ids) => [...ids, issue.id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
