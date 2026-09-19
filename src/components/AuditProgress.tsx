import { AuditStatusBadge } from '@/components/ui/AuditStatusBadge';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT AuditProgress — progreso de auditoría en curso: badge de
   estado, barra animada, stats reales (páginas rastreadas + tiempo
   transcurrido) y botón de cancelar. Presentacional: el padre sondea.
   Semana 7 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export function formatElapsed(totalSecs: number) {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AuditProgress({
  status,
  progress,
  pagesScanned,
  elapsedSecs,
  onCancel,
  cancelling = false,
}: {
  status: 'pending' | 'running';
  /** 0-100. */
  progress: number;
  pagesScanned: number;
  elapsedSecs: number;
  onCancel: () => void;
  cancelling?: boolean;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <AuditStatusBadge status={status} />
        <span className="font-display text-xl font-extrabold tabular-nums text-foreground">
          {Math.round(progress)}
          <span className="text-xs font-mono text-muted-fg">%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de la auditoría"
      >
        <div className="h-2 overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-corporate-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-2xs tabular-nums text-muted-fg">
        <span>
          <span className="font-extrabold text-foreground">{pagesScanned}</span>{' '}
          páginas
        </span>
        <span className="font-mono">{formatElapsed(elapsedSecs)}</span>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={onCancel}
        disabled={cancelling}
        className="w-full"
      >
        <X size={14} strokeWidth={3} />
        {cancelling ? 'Cancelando…' : 'Cancelar auditoría'}
      </Button>
    </div>
  );
}
