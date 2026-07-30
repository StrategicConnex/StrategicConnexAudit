'use client';

import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, Settings,
  ShieldCheck, Sliders, HeartPulse, Crosshair, BookOpen, Zap, Key
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/app/components/LanguageSwitcher';


const AiCoreVisual = dynamic(() => import('./AiCoreVisual'), { ssr: false });


// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardTab = 'overview' | 'projects' | 'performance' | 'keywords' | 'reports' | 'intelligence' | 'monitoring' | 'settings';

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
}

function NavButton({ tab, activeTab, icon, label, badge, onClick }: NavButtonProps) {
  const isActive = activeTab === tab;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 group border cursor-pointer ${
        isActive
          ? 'bg-primary/5 text-foreground border-primary/15 shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
          : 'text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={isActive ? 'text-primary drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'text-muted-fg group-hover:text-primary transition-colors duration-300'}>
          {icon}
        </span>
        <span className="tracking-tight">{label}</span>
      </div>
      {badge}
    </button>
  );
}

// ─── DashboardSidebar ─────────────────────────────────────────────────────────

export function DashboardSidebar({ activeTab, onTabChange, projectCount }: DashboardSidebarProps) {
  const t = useTranslations('sidebar');
  return (
    <aside className="w-66 bg-[#040406]/60 backdrop-blur-2xl border-r border-border hidden md:flex flex-col shrink-0 relative overflow-hidden">
      {/* Top Ambient Glow in Sidebar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-24 bg-gradient-to-b from-primary/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Logo Area */}
      <div className="h-20 flex items-center px-6 shrink-0 z-10 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 flex items-center justify-center relative group">
            <AiCoreVisual size={38} interactive={true} />
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="font-extrabold text-[15px] tracking-tight text-foreground flex items-center gap-1.5">
              {t('brand')}
            </span>
            <span className="text-[10px] text-primary font-extrabold tracking-widest uppercase opacity-90 flex items-center gap-1">
              {t('pro')} <span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse inline-block" />
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 z-10 mt-2">
        <NavButton
          tab="overview"
          activeTab={activeTab}
          icon={<LayoutDashboard size={18} strokeWidth={2} />}
          label={t('tabs.overview')}
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('live')}</span>}
          onClick={() => onTabChange('overview')}
        />

        <NavButton
          tab="projects"
          activeTab={activeTab}
          icon={<Globe size={18} strokeWidth={2} />}
          label={t('tabs.projects')}
          badge={<span className="text-[10px] bg-muted/20 text-foreground border border-border px-2.5 py-0.5 rounded-full font-bold">{projectCount}</span>}
          onClick={() => onTabChange('projects')}
        />

        <NavButton
          tab="performance"
          activeTab={activeTab}
          icon={<Activity size={18} strokeWidth={2} />}
          label={t('tabs.performance')}
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold">92%</span>}
          onClick={() => onTabChange('performance')}
        />

        <NavButton
          tab="keywords"
          activeTab={activeTab}
          icon={<Search size={18} strokeWidth={2} />}
          label={t('tabs.keywords')}
          onClick={() => onTabChange('keywords')}
        />

        <NavButton
          tab="reports"
          activeTab={activeTab}
          icon={<BarChart3 size={18} strokeWidth={2} />}
          label={t('tabs.reports')}
          badge={<span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('audit')}</span>}
          onClick={() => onTabChange('reports')}
        />

        <NavButton
          tab="intelligence"
          activeTab={activeTab}
          icon={<ShieldCheck size={18} strokeWidth={2} />}
          label={t('tabs.intelligence')}
          badge={<span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('beta')}</span>}
          onClick={() => onTabChange('intelligence')}
        />

        <NavButton
          tab="monitoring"
          activeTab={activeTab}
          icon={<Sliders size={18} strokeWidth={2} />}
          label={t('tabs.monitoring')}
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('apis')}</span>}
          onClick={() => onTabChange('monitoring')}
        />
      </nav>

      {/* Live AI Scanner Status Card */}
      <div className="mx-4 my-2 p-4 rounded-xl border border-border bg-muted/10 space-y-3 relative overflow-hidden group z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-chartreuse/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="flex items-center justify-between relative z-10">
          <span className="text-[9px] text-muted-fg font-extrabold tracking-widest uppercase">{t('copilotEngine')}</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-chartreuse font-bold">{t('active')}</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-chartreuse scan-pulse" />
          </div>
        </div>
        <div className="space-y-1 relative z-10">
          <div className="text-[12px] font-bold text-foreground/80 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary" /> {t('continuousAudit')}
          </div>
          <div className="text-[10px] text-muted-fg">{t('securityIndex', { index: '99.98' })}</div>
        </div>
      </div>

      {/* External Links */}
      <div className="px-4 mb-1 z-10 space-y-1">
        <a
          href="/docs"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <BookOpen size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.docs')}</span>
          <span className="ml-auto text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.docsBadge')}</span>
        </a>
        <a
          href="/ai/health"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <HeartPulse size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.aiHealth')}</span>
          <span className="ml-auto text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.aiHealthBadge')}</span>
        </a>
        <a
          href="/mitre-coverage"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <Crosshair size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.mitre')}</span>
          <span className="ml-auto text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.mitreBadge')}</span>
        </a>
        <a
          href="/docs/api"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <BookOpen size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.apiReference')}</span>
          <span className="ml-auto text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.docsBadge')}</span>
        </a>
        <a
          href="/settings/api-keys"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <Key size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.apiKeys')}</span>
          <span className="ml-auto text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.apiKeysBadge')}</span>
        </a>
        <a
          href="/swagger"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <Zap size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">{t('links.apiPlayground')}</span>
          <span className="ml-auto text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{t('links.apiPlaygroundBadge')}</span>
        </a>
      </div>

      {/* Settings Footer */}
      <div className="px-4 pb-2 z-10">
        <div className="flex items-center justify-between px-1">
          <LanguageSwitcher mini />
        </div>
      </div>

      <div className="p-4 border-t border-border/50 shrink-0 z-10">
        <button
          onClick={() => onTabChange('settings')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-primary/5 text-foreground border-primary/15 shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
              : 'text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10'
          }`}
        >
          <Settings size={18} strokeWidth={2} className={activeTab === 'settings' ? 'text-primary' : 'text-muted-fg'} />
          <span className="tracking-tight">{t('settings')}</span>
        </button>
      </div>
    </aside>
  );
}
