'use client';

import { useEffect, useRef } from 'react';
import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, ShieldCheck,
  Sliders, Skull, Package, Settings, X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardTab } from './DashboardSidebar';

interface MobileNavProps {
  open: boolean;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onClose: () => void;
}

const TABS: { tab: DashboardTab; icon: React.ReactNode; labelKey: string }[] = [
  { tab: 'overview', icon: <LayoutDashboard size={18} strokeWidth={2} />, labelKey: 'tabs.overview' },
  { tab: 'projects', icon: <Globe size={18} strokeWidth={2} />, labelKey: 'tabs.projects' },
  { tab: 'performance', icon: <Activity size={18} strokeWidth={2} />, labelKey: 'tabs.performance' },
  { tab: 'keywords', icon: <Search size={18} strokeWidth={2} />, labelKey: 'tabs.keywords' },
  { tab: 'reports', icon: <BarChart3 size={18} strokeWidth={2} />, labelKey: 'tabs.reports' },
  { tab: 'intelligence', icon: <ShieldCheck size={18} strokeWidth={2} />, labelKey: 'tabs.intelligence' },
  { tab: 'monitoring', icon: <Sliders size={18} strokeWidth={2} />, labelKey: 'tabs.monitoring' },
  { tab: 'adversary', icon: <Skull size={18} strokeWidth={2} />, labelKey: 'tabs.adversary' },
  { tab: 'plugins', icon: <Package size={18} strokeWidth={2} />, labelKey: 'tabs.marketplace' },
  { tab: 'settings', icon: <Settings size={18} strokeWidth={2} />, labelKey: 'tabs.settings' },
];

/**
 * Navegación móvil del dashboard: el sidebar es `hidden md:flex`, así que sin
 * esto no hay forma de cambiar de pestaña en pantallas pequeñas.
 */
export function MobileNav({ open, activeTab, onTabChange, onClose }: MobileNavProps) {
  const t = useTranslations('sidebar');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label={t('navLabel')}>
      <button
        aria-label={t('closeMenu')}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />
      <nav className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface/95 backdrop-blur-2xl border-r border-border flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
          <span className="text-sm font-extrabold tracking-tight text-foreground">
            {t('brand')} <span className="text-primary text-2xs align-top">{t('pro')}</span>
          </span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t('closeMenu')}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {TABS.map(({ tab, icon, labelKey }) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  onTabChange(tab);
                  onClose();
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors border cursor-pointer ${
                  isActive
                    ? 'bg-primary/10 text-foreground border-primary/20'
                    : 'text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground'
                }`}
              >
                <span className={isActive ? 'text-primary' : ''}>{icon}</span>
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
