import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT MetricCard — tarjeta de métrica del resumen rápido: icono,
   valor grande y etiqueta. Datos reales o "—", nunca cifras inventadas.
   Semana 5 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export function MetricCard({
  icon,
  label,
  value,
  hint,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Card
      variant="interactive"
      className={cn('p-5 flex items-center gap-4', className)}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-2xl font-extrabold tabular-nums text-foreground">
          {value}
        </span>
        <span className="truncate text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
          {label}
        </span>
        {hint && (
          <span className="truncate text-2xs text-muted-fg/70">{hint}</span>
        )}
      </div>
    </Card>
  );
}
