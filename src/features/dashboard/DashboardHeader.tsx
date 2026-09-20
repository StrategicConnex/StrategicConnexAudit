import React, { useEffect } from 'react';
import { Bell, Menu, Search, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InstallPwaButton } from './InstallPwaButton';
import { ThemeSwitcher } from "@/shared/design-system";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuPopup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useNotificationCenter } from '@/shared/hooks/use-notification-center';

/* ─── Command palette (Semana 4) — contrato de apertura ───────────────
   La paleta vivirá en Semana 4 escuchando este evento + el atajo ⌘K/Ctrl+K
   (registrado aquí para que el trigger sea funcional desde ya). */
export const OPEN_PALETTE_EVENT = 'scaudit:open-palette';

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

interface DashboardHeaderProps {
  activeTab: string;
  NewProjectModal: React.ComponentType<{ onCreated?: () => void }>;
  onMenu: () => void;
  onNavigateProjects: () => void;
  /** Iniciales del usuario (avatar). Por defecto "··" si no hay sesión. */
  userInitials?: string;
  /** Nº de notificaciones sin leer (badge de la campana). */
  notificationCount?: number;
  /** Abre la pestaña de configuración (menú del avatar). */
  onOpenSettings?: () => void;
}

const TITLE_KEYS: Record<string, string> = {
  overview: 'header.overviewTitle',
  projects: 'tabs.projects',
  performance: 'tabs.performance',
  keywords: 'tabs.keywords',
  reports: 'tabs.reports',
  intelligence: 'tabs.intelligence',
  monitoring: 'tabs.monitoring',
  adversary: 'tabs.adversary',
  plugins: 'tabs.marketplace',
  settings: 'tabs.settings',
};

export function DashboardHeader({
  activeTab,
  NewProjectModal,
  onMenu,
  onNavigateProjects,
  userInitials = '··',
  notificationCount = 0,
  onOpenSettings,
}: DashboardHeaderProps) {
  const t = useTranslations('sidebar');
  const title = t(TITLE_KEYS[activeTab] ?? 'header.overviewTitle');
  // Semana 10: badge de la campana alimentado por el NotificationCenter.
  const { unreadCount: liveUnread } = useNotificationCenter();
  const bellCount = notificationCount > 0 ? notificationCount : liveUnread;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="h-14 bg-background/60 backdrop-blur-xl border-b border-border/50 flex items-center justify-between gap-2 px-3 sm:px-10 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenu}
          aria-label={t('menu')}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div key={activeTab} className="flex flex-col min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-200">
          <nav aria-label={t('header.breadcrumb')}>
            <ol className="flex items-center gap-1.5 text-2xs font-extrabold uppercase tracking-widest">
              <li className="text-muted-fg/70 shrink-0">{t('header.home')}</li>
              <li aria-hidden="true" className="text-muted-fg/40">/</li>
              <li aria-current="page" className="text-primary truncate">{title}</li>
            </ol>
          </nav>
          <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Trigger de la paleta de comandos (⌘K) — la paleta llega en Semana 4 */}
      <button
        onClick={openCommandPalette}
        aria-label={t('header.openPalette')}
        className="hidden md:flex flex-1 max-w-md mx-4 items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-fg transition-colors duration-200 hover:border-primary/30 hover:text-foreground cursor-pointer"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 text-left truncate">{t('header.searchPlaceholder')}</span>
        <kbd className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-2xs font-bold">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <InstallPwaButton />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('notifications.title')}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/40 transition-colors duration-200"
          >
            <Bell className="w-5 h-5" />
            {bellCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-corporate-danger text-white text-2xs font-extrabold flex items-center justify-center">
                {bellCount > 9 ? '9+' : bellCount}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuPositioner align="end">
              <DropdownMenuPopup className="w-80 p-2">
                <NotificationCenter />
              </DropdownMenuPopup>
            </DropdownMenuPositioner>
          </DropdownMenuPortal>
        </DropdownMenu>
        <ThemeSwitcher compact />
        <NewProjectModal onCreated={onNavigateProjects} />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('userMenu.account')}
            className="hidden sm:flex w-9 h-9 rounded-full bg-muted/20 hover:bg-muted/40 items-center justify-center cursor-pointer transition-colors duration-200 border border-border/40 relative"
          >
            <span className="text-xs font-bold text-foreground/80">{userInitials}</span>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-chartreuse border-2 border-background rounded-full" />
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuPositioner align="end">
              <DropdownMenuPopup className="w-56 p-1.5">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-9 h-9 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center text-xs font-bold text-foreground">
                    {userInitials}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">{userInitials}</span>
                    <span className="text-2xs text-muted-fg">{t('userMenu.account')}</span>
                  </div>
                </div>
                {onOpenSettings && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onOpenSettings}>
                      <Settings size={14} />
                      {t('userMenu.settings')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuPopup>
            </DropdownMenuPositioner>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </header>
  );
}
