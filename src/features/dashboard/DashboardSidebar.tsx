'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, Settings,
  ShieldCheck, Sliders, HeartPulse, Crosshair, BookOpen, Zap, Key, Skull, Package
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/Badge';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/features/dashboard/LanguageSwitcher';
import { loadIntelligenceTab } from './tab-loaders';
import { ThemeSwitcher } from "@/shared/design-system";

const AiCoreVisual = dynamic(() => import('./AiCoreVisual'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardTab = 'overview' | 'projects' | 'performance' | 'keywords' | 'reports' | 'intelligence' | 'monitoring' | 'adversary' | 'plugins' | 'settings';

interface DashboardSidebarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  projectCount: number;
}

// ─── NavButton ────────────────────────────────────────────────────────────────

interface NavButtonProps {
  tab: DashboardTab;
  activeTab: DashboardTab;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  onClick: () => void;
  onHover?: () => void;
  collapsed?: boolean;
}

function NavButton({ tab, activeTab, icon, label, badge, onClick, onHover, collapsed }: NavButtonProps) {
  const isActive = activeTab === tab;
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      title={collapsed ? label : undefined}
      className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-4'} py-3 rounded-lg text-sm font-medium transition-colors duration-300 group border cursor-pointer ${
        isActive
          ? 'bg-primary/8 text-foreground border-primary/15 shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
          : 'text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10'
      }`}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary"
        />
      )}
      <div className="flex items-center gap-3">
        <span className={isActive ? 'text-primary' : 'text-muted-fg group-hover:text-primary transition-colors duration-300'}>
          {icon}
        </span>
        {!collapsed && <span className="tracking-tight">{label}</span>}
      </div>
      {!collapsed && badge}
    </button>
  );
}

// ─── DashboardSidebar ─────────────────────────────────────────────────────────

export function DashboardSidebar({ activeTab, onTabChange, projectCount }: DashboardSidebarProps) {
  const t = useTranslations('sidebar');
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <aside className={`${collapsed ? 'w-[72px]' : 'w-66'} bg-surface/60 backdrop-blur-2xl border-r border-border hidden md:flex flex-col shrink-0 relative overflow-hidden transition-all duration-300`}>
      {/* Top Ambient Glow in Sidebar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-24 bg-gradient-to-b from-primary/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Logo Area */}
      <div className="h-14 flex items-center justify-center shrink-0 z-10 border-b border-border/50 relative">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-3 right-2 w-6 h-6 flex items-center justify-center rounded bg-muted/30 hover:bg-muted/50 text-muted-fg hover:text-foreground transition-colors text-xs z-20"
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 flex items-center justify-center relative group shrink-0">
            <AiCoreVisual size={38} interactive={true} />
          </div>
          {!collapsed && (
            <div className="flex flex-col -space-y-1">
              <span className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-1.5">
                {t('brand')}
              </span>
              <span className="text-2xs text-primary font-extrabold tracking-widest uppercase opacity-90 flex items-center gap-1">
                {t('pro')} <span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse inline-block" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 z-10 mt-2">
        <NavButton
          collapsed={collapsed}
          tab="overview"
          activeTab={activeTab}
          icon={<LayoutDashboard size={18} strokeWidth={2} />}
          label={t('tabs.overview')}
          badge={<Badge variant="live">{t('live')}</Badge>}
          onClick={() => onTabChange('overview')}
        />

        <NavButton
          collapsed={collapsed}
          tab="projects"
          activeTab={activeTab}
          icon={<Globe size={18} strokeWidth={2} />}
          label={t('tabs.projects')}
          badge={<Badge variant="neutral">{projectCount}</Badge>}
          onClick={() => onTabChange('projects')}
        />

        <NavButton
          collapsed={collapsed}
          tab="performance"
          activeTab={activeTab}
          icon={<Activity size={18} strokeWidth={2} />}
          label={t('tabs.performance')}
          badge={<Badge variant="neutral">92%</Badge>}
          onClick={() => onTabChange('performance')}
        />

        <NavButton
          collapsed={collapsed}
          tab="keywords"
          activeTab={activeTab}
          icon={<Search size={18} strokeWidth={2} />}
          label={t('tabs.keywords')}
          onClick={() => onTabChange('keywords')}
        />

        <NavButton
          collapsed={collapsed}
          tab="reports"
          activeTab={activeTab}
          icon={<BarChart3 size={18} strokeWidth={2} />}
          label={t('tabs.reports')}
          badge={<Badge variant="neutral">{t('audit')}</Badge>}
          onClick={() => onTabChange('reports')}
        />

        <NavButton
          collapsed={collapsed}
          tab="intelligence"
          activeTab={activeTab}
          icon={<ShieldCheck size={18} strokeWidth={2} />}
          label={t('tabs.intelligence')}
          badge={<Badge variant="neutral">{t('beta')}</Badge>}
          onClick={() => onTabChange('intelligence')}
          onHover={() => { void loadIntelligenceTab(); }}
        />

        <NavButton
          collapsed={collapsed}
          tab="monitoring"
          activeTab={activeTab}
          icon={<Sliders size={18} strokeWidth={2} />}
          label={t('tabs.monitoring')}
          badge={<Badge variant="neutral">{t('apis')}</Badge>}
          onClick={() => onTabChange('monitoring')}
        />

        <NavButton
          collapsed={collapsed}
          tab="adversary"
          activeTab={activeTab}
          icon={<Skull size={18} strokeWidth={2} />}
          label={t('tabs.adversary')}
          badge={<Badge variant="alert">BAS</Badge>}
          onClick={() => onTabChange('adversary')}
        />

        <NavButton
          collapsed={collapsed}
          tab="plugins"
          activeTab={activeTab}
          icon={<Package size={18} strokeWidth={2} />}
          label={t('tabs.marketplace')}
          badge={<Badge variant="neutral">{t('new')}</Badge>}
          onClick={() => onTabChange('plugins')}
        />
      </nav>

      {/* Live AI Scanner Status Card — hidden when collapsed */}
      {!collapsed && (
        <div className="mx-4 my-2 p-4 rounded-xl border border-border bg-muted/10 space-y-3 relative overflow-hidden group z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-chartreuse/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-2xs text-muted-fg font-extrabold tracking-widest uppercase">{t('copilotEngine')}</span>
            <div className="flex items-center gap-1">
              <span className="text-2xs text-chartreuse font-bold">{t('active')}</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-chartreuse scan-pulse" />
            </div>
          </div>
          <div className="space-y-1 relative z-10">
            <div className="text-xs font-bold text-foreground/80 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-primary" /> {t('continuousAudit')}
            </div>
            <div className="text-2xs text-muted-fg">{t('securityIndex', { index: '99.98' })}</div>
          </div>
        </div>
      )}

      {/* External Links — hidden when collapsed */}
      {!collapsed && (
        <div className="px-4 mb-1 z-10 space-y-1">
          <Link href="/docs" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <BookOpen size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.docs')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.docsBadge')}</Badge>
          </Link>
          <Link href="/ai/health" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <HeartPulse size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.aiHealth')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.aiHealthBadge')}</Badge>
          </Link>
          <Link href="/mitre-coverage" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <Crosshair size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.mitre')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.mitreBadge')}</Badge>
          </Link>
          <Link href="/docs/api" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <BookOpen size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.apiReference')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.docsBadge')}</Badge>
          </Link>
          <Link href="/settings/api-keys" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <Key size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.apiKeys')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.apiKeysBadge')}</Badge>
          </Link>
          <Link href="/swagger" className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10">
            <Zap size={18} strokeWidth={2} className="text-muted-fg" />
            <span className="tracking-tight">{t('links.apiPlayground')}</span>
            <Badge variant="neutral" className="ml-auto">{t('links.apiPlaygroundBadge')}</Badge>
          </Link>
        </div>
      )}

      {/* Settings Footer — hidden when collapsed */}
      {!collapsed && (
        <div className="px-4 pb-2 z-10 space-y-2">
          <div className="flex items-center justify-between px-1">
            <LanguageSwitcher mini />
          </div>
          <div className="flex items-center justify-center px-1">
            <ThemeSwitcher />
          </div>
        </div>
      )}

      {/* Settings button — always visible */}
      <div className="p-4 border-t border-border/50 shrink-0 z-10">
        <button
          onClick={() => onTabChange('settings')}
          title={collapsed ? t('settings') : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 rounded-lg text-sm font-medium transition-colors duration-300 border cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-primary/5 text-foreground border-primary/15 shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
              : 'text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10'
          }`}
        >
          <Settings size={18} strokeWidth={2} className={activeTab === 'settings' ? 'text-primary' : 'text-muted-fg'} />
          {!collapsed && <span className="tracking-tight">{t('settings')}</span>}
        </button>
      </div>
    </aside>
  );
}
