import { Card } from '@/components/ui/Card';
import { ScoreGauge, scoreTone } from '@/components/ui/ScoreGauge';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT ProjectScoreCard — gauge grande + scores por categoría con
   barras. Solo datos reales (value null = sin dato, barra vacía).
   Semana 6 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface ScoreCategory {
  label: string;
  /** 0-100 o null si no hay dato. */
  value: number | null;
  /** Texto ya formateado ("85%", "3/4", "Online"). */
  display: string;
}

const BAR_TONE: Record<ReturnType<typeof scoreTone>, string> = {
  success: 'bg-corporate-success',
  warning: 'bg-corporate-warning',
  danger: 'bg-corporate-danger',
};

export function ProjectScoreCard({
  overall,
  overallLabel,
  categories,
  updatedLabel,
}: {
  overall: number | null;
  overallLabel: string;
  categories: ScoreCategory[];
  updatedLabel?: string;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        <ScoreGauge value={overall} size={140} ariaLabel={overallLabel} />
        <div className="w-full flex-1 space-y-4">
          {categories.map((c) => (
            <div key={c.label}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                  {c.label}
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {c.display}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/40"
                role="presentation"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                    c.value == null ? 'w-0' : BAR_TONE[scoreTone(c.value)],
                  )}
                  style={c.value == null ? undefined : { width: `${Math.min(100, Math.max(0, c.value))}%` }}
                />
              </div>
            </div>
          ))}
          {updatedLabel && (
            <p className="text-2xs text-muted-fg/70">{updatedLabel}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
