import { Card } from '@/components/ui/Card';
import { ScoreGauge } from '@/components/ui/ScoreGauge';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT ClientScoreCard — score general + scores por categoría para el
   portal cliente (marca blanca: acento dinámico). Solo datos reales.
   Semana 9 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface CategoryScore {
  label: string;
  value: number | null;
}

export function ClientScoreCard({
  overall,
  overallLabel,
  categories,
  accent = '#D4A843',
}: {
  overall: number | null;
  overallLabel: string;
  categories: CategoryScore[];
  accent?: string;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <ScoreGauge value={overall} size={140} ariaLabel={overallLabel} />
        <div className="w-full flex-1 space-y-3">
          {categories.length === 0 && (
            <p className="text-xs text-muted-fg">
              {overall == null
                ? 'Aún no hay auditorías completadas.'
                : 'Sin hallazgos por categoría.'}
            </p>
          )}
          {categories.map((c) => (
            <div key={c.label}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                  {c.label}
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {c.value == null ? '—' : `${c.value}`}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/40"
                role="presentation"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${c.value == null ? 0 : Math.min(100, Math.max(0, c.value))}%`,
                    backgroundColor: accent,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
