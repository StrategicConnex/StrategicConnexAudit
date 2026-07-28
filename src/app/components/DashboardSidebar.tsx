'use client';

import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, Settings,
  ShieldCheck, Sliders, HeartPulse
} from 'lucide-react';
import dynamic from 'next/dynamic';


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
              StrategicAudit
            </span>
            <span className="text-[10px] text-primary font-extrabold tracking-widest uppercase opacity-90 flex items-center gap-1">
              PRO <span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse inline-block" />
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
          label="Resumen"
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Live</span>}
          onClick={() => onTabChange('overview')}
        />

        <NavButton
          tab="projects"
          activeTab={activeTab}
          icon={<Globe size={18} strokeWidth={2} />}
          label="Proyectos"
          badge={<span className="text-[10px] bg-muted/20 text-foreground border border-border px-2.5 py-0.5 rounded-full font-bold">{projectCount}</span>}
          onClick={() => onTabChange('projects')}
        />

        <NavButton
          tab="performance"
          activeTab={activeTab}
          icon={<Activity size={18} strokeWidth={2} />}
          label="Rendimiento"
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold">92%</span>}
          onClick={() => onTabChange('performance')}
        />

        <NavButton
          tab="keywords"
          activeTab={activeTab}
          icon={<Search size={18} strokeWidth={2} />}
          label="Palabras Clave"
          onClick={() => onTabChange('keywords')}
        />

        <NavButton
          tab="reports"
          activeTab={activeTab}
          icon={<BarChart3 size={18} strokeWidth={2} />}
          label="Reportes AI"
          badge={<span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Audit</span>}
          onClick={() => onTabChange('reports')}
        />

        <NavButton
          tab="intelligence"
          activeTab={activeTab}
          icon={<ShieldCheck size={18} strokeWidth={2} />}
          label="Inteligencia"
          badge={<span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Beta</span>}
          onClick={() => onTabChange('intelligence')}
        />

        <NavButton
          tab="monitoring"
          activeTab={activeTab}
          icon={<Sliders size={18} strokeWidth={2} />}
          label="Controles Activos"
          badge={<span className="text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">APIs</span>}
          onClick={() => onTabChange('monitoring')}
        />
      </nav>

      {/* Live AI Scanner Status Card */}
      <div className="mx-4 my-2 p-4 rounded-xl border border-border bg-muted/10 space-y-3 relative overflow-hidden group z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-chartreuse/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="flex items-center justify-between relative z-10">
          <span className="text-[9px] text-muted-fg font-extrabold tracking-widest uppercase">Copilot Engine</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-chartreuse font-bold">ACTIVE</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-chartreuse scan-pulse" />
          </div>
        </div>
        <div className="space-y-1 relative z-10">
          <div className="text-[12px] font-bold text-foreground/80 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary" /> Continuous Audit
          </div>
          <div className="text-[10px] text-muted-fg">Security Index: 99.98%</div>
        </div>
      </div>

      {/* External Links */}
      <div className="px-4 mb-1 z-10">
        <a
          href="/ai/health"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer text-muted-fg border-transparent hover:bg-primary/5 hover:text-foreground hover:border-primary/10"
        >
          <HeartPulse size={18} strokeWidth={2} className="text-muted-fg" />
          <span className="tracking-tight">Salud IA</span>
          <span className="ml-auto text-[9px] bg-chartreuse/10 text-chartreuse border border-chartreuse/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Monitor</span>
        </a>
      </div>

      {/* Settings Footer */}
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
          <span className="tracking-tight">Configuración</span>
        </button>
      </div>
    </aside>
  );
}
