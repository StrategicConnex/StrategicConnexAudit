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
      /* En <sm el icono ocupa su propia fila: con icon+gap horizontal la
         columna de texto se queda en ~55px y las etiquetas en mayúsculas
         (tracking-widest) necesitan 80px → se desbordan de la tarjeta. */
      className={cn('p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4', className)}
    >
      <span className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-2xl font-extrabold tabular-nums text-foreground">
          {value}
        </span>
        {/* Sin `truncate`: en 390px la etiqueta quedaba en 43px y se
            renderizaba como "PRO…" / "AUD…". Envolver a dos líneas es más
            legible que perder la mitad de la palabra. */}
        <span className="text-2xs font-extrabold uppercase tracking-wide sm:tracking-widest text-muted-fg leading-tight">
          {label}
        </span>
        {hint && (
          <span className="truncate text-2xs text-muted-fg/70">{hint}</span>
        )}
      </div>
    </Card>
  );
}
