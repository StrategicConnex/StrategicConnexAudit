import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT ActivityTimeline — lista cronológica de eventos con badge por
   tipo. Los eventos se construyen con `buildTimelineEvents` (puro y
   testeable): creaciones de proyecto + chequeos fallidos, máx 10,
   ordenados descendente. Semana 5 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface TimelineEvent {
  id: string;
  tone: BadgeVariant;
  title: string;
  detail?: string;
  /** ISO-8601 para <time dateTime>. */
  at: string;
  /** Fecha ya formateada para mostrar. */
  display: string;
}

export function formatEventTime(at: string | Date): { at: string; display: string } {
  const d = typeof at === 'string' ? new Date(at) : at;
  return {
    at: d.toISOString(),
    display: d.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export function buildTimelineEvents({
  projects,
  failedChecks,
  projectAddedLabel,
  checkFailedLabel,
  limit = 10,
}: {
  projects: { id: string; name: string; createdAt: string | Date | null }[];
  failedChecks: { checkedAt: string; responseTimeMs?: number | null }[];
  projectAddedLabel: string;
  checkFailedLabel: string;
  limit?: number;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...projects
      .filter((p) => p.createdAt != null)
      .map((p) => {
        const { at, display } = formatEventTime(p.createdAt as string | Date);
        return {
          id: `project-${p.id}`,
          tone: 'info' as BadgeVariant,
          title: projectAddedLabel,
          detail: p.name,
          at,
          display,
        };
      }),
    ...failedChecks.map((c, i) => {
      const { at, display } = formatEventTime(c.checkedAt);
      return {
        id: `check-fail-${at}-${i}`,
        tone: 'critical' as BadgeVariant,
        title: checkFailedLabel,
        detail:
          c.responseTimeMs != null ? `${c.responseTimeMs}ms` : undefined,
        at,
        display,
      };
    }),
  ];
  return events.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export function ActivityTimeline({
  events,
  emptyLabel,
  className,
}: {
  events: TimelineEvent[];
  emptyLabel: string;
  className?: string;
}) {
  if (events.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-muted-fg">{emptyLabel}</p>;
  }
  return (
    <ol className={cn('relative space-y-4', className)}>
      {events.map((e) => (
        <li key={e.id} className="relative flex gap-3 pl-1">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={e.tone}>{e.title}</Badge>
              <time dateTime={e.at} className="text-2xs tabular-nums text-muted-fg/70">
                {e.display}
              </time>
            </div>
            {e.detail && (
              <p className="truncate text-xs font-semibold text-foreground">
                {e.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
