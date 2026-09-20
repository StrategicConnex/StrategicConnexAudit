'use client';

import { Bell, CheckCheck, Trash2, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useNotificationCenter } from '@/shared/hooks/use-notification-center';
import type { NotificationSeverity } from '@/shared/lib/notify';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT NotificationCenter — campana del header con historial real
   (Semana 10). Muestra las notificaciones in-app emitidas vía `notify`,
   agrupa por severidad y permite marcar leídas / limpiar.

   Los canales email/Telegram siguen viviendo en su lugar:
   - Telegram: TelegramDigestCard (project.settings.telegramChatId)
   - Email: digest semanal (runWeeklyDigest / weekly-digest.trigger)
   ═══════════════════════════════════════════════════════════════════════ */

const SEVERITY_STYLE: Record<NotificationSeverity, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-400' },
  error: { icon: XCircle, className: 'text-destructive' },
  warning: { icon: AlertTriangle, className: 'text-[oklch(75%_0.13_80)]' },
  info: { icon: Info, className: 'text-primary' },
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function NotificationCenter() {
  const { history, unreadCount, markAllRead, clearNotifications } = useNotificationCenter();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
          Notificaciones
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-corporate-danger px-1.5 py-0.5 text-white">
              {unreadCount}
            </span>
          )}
        </p>
        {history.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={markAllRead}
              aria-label="Marcar todas como leídas"
              title="Marcar todas como leídas"
              className="cursor-pointer rounded-lg p-1.5 text-muted-fg transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <CheckCheck size={14} />
            </button>
            <button
              onClick={clearNotifications}
              aria-label="Limpiar notificaciones"
              title="Limpiar notificaciones"
              className="cursor-pointer rounded-lg p-1.5 text-muted-fg transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Bell size={20} className="text-muted-fg" />
          <p className="text-xs font-semibold text-foreground">Sin notificaciones</p>
          <p className="max-w-[220px] text-2xs leading-relaxed text-muted-fg">
            Los eventos de auditorías, alertas y análisis aparecerán aquí.
          </p>
        </div>
      ) : (
        <ul className="max-h-80 divide-y divide-border/40 overflow-y-auto">
          {history.map((entry) => {
            const { icon: Icon, className } = SEVERITY_STYLE[entry.severity];
            return (
              <li
                key={entry.id}
                className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/30 ${
                  entry.read ? 'opacity-60' : ''
                }`}
              >
                <Icon size={15} className={`mt-0.5 shrink-0 ${className}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{entry.message}</p>
                  {entry.description && (
                    <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-muted-fg">
                      {entry.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-2xs text-muted-fg">{formatTime(entry.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
