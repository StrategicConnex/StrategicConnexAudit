import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT AuditStatusBadge — estado de auditoría con punto de color
   (spec §6.2: pendiente gris, ejecutando pulsante, completado verde,
   fallido rojo, cancelado amarillo). Semana 6 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export type AuditStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

const STATUS: Record<
  AuditStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'critical' | 'warning'; dot: string }
> = {
  pending: { label: 'Pendiente', variant: 'neutral', dot: 'bg-muted-fg' },
  running: {
    label: 'Ejecutando',
    variant: 'info',
    dot: 'bg-corporate-primary-light animate-pulse',
  },
  completed: {
    label: 'Completado',
    variant: 'success',
    dot: 'bg-corporate-success',
  },
  failed: { label: 'Fallido', variant: 'critical', dot: 'bg-corporate-danger' },
  cancelled: {
    label: 'Cancelado',
    variant: 'warning',
    dot: 'bg-corporate-warning',
  },
};

export function AuditStatusBadge({
  status,
  className,
}: {
  status: AuditStatus | string;
  className?: string;
}) {
  const s =
    STATUS[status as AuditStatus] ?? STATUS.pending;
  return (
    <Badge variant={s.variant} className={cn('gap-1.5', className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  );
}
