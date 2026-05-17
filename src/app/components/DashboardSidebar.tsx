'use client';

import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, Settings,
  Zap
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardTab = 'overview' | 'projects' | 'performance' | 'keywords' | 'reports' | 'settings';

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
      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-apple-sm text-[13px] font-medium transition-all group ${
        isActive
          ? 'bg-apple-gray text-apple-ink'
          : 'text-apple-ink/60 hover:bg-apple-gray/50 hover:text-apple-ink'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={isActive ? 'text-apple-blue' : 'text-apple-ink/50 group-hover:text-apple-blue transition-colors'}>
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
    <aside className="w-64 bg-apple-gray/80 backdrop-blur-xl border-r border-apple-gray-dark/10 hidden md:flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-20 flex items-center px-6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-apple-sm bg-apple-ink flex items-center justify-center shadow-sm">
            <Zap className="h-4.5 w-4.5 text-white fill-white/20" />
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="font-bold text-[15px] tracking-tight text-apple-ink">StrategicAudit</span>
            <span className="text-[10px] text-apple-blue font-bold tracking-widest uppercase opacity-80">PRO</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <NavButton
          tab="overview"
          activeTab={activeTab}
          icon={<LayoutDashboard size={18} strokeWidth={2.2} />}
          label="Resumen"
          badge={<span className="text-[10px] bg-apple-ink/5 text-apple-ink/40 px-2 py-0.5 rounded-apple-pill font-semibold">Live</span>}
          onClick={() => onTabChange('overview')}
        />

        <NavButton
          tab="projects"
          activeTab={activeTab}
          icon={<Globe size={18} strokeWidth={2.2} />}
          label="Proyectos"
          badge={<span className="text-[10px] bg-apple-blue/10 text-apple-blue px-2 py-0.5 rounded-apple-pill font-bold">{projectCount}</span>}
          onClick={() => onTabChange('projects')}
        />

        <NavButton
          tab="performance"
          activeTab={activeTab}
          icon={<Activity size={18} strokeWidth={2.2} />}
          label="Rendimiento"
          badge={<span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-apple-pill font-bold">92%</span>}
          onClick={() => onTabChange('performance')}
        />

        <NavButton
          tab="keywords"
          activeTab={activeTab}
          icon={<Search size={18} strokeWidth={2.2} />}
          label="Palabras Clave"
          onClick={() => onTabChange('keywords')}
        />

        <NavButton
          tab="reports"
          activeTab={activeTab}
          icon={<BarChart3 size={18} strokeWidth={2.2} />}
          label="Reportes"
          badge={<span className="text-[10px] bg-apple-ink/5 text-apple-ink/40 px-2 py-0.5 rounded-apple-pill font-semibold">PDF</span>}
          onClick={() => onTabChange('reports')}
        />
      </nav>

      {/* Settings Footer */}
      <div className="p-4 border-t border-apple-gray-dark/5 shrink-0">
        <button
          onClick={() => onTabChange('settings')}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-apple-sm text-[13px] font-medium transition-all ${
            activeTab === 'settings'
              ? 'bg-apple-gray text-apple-ink'
              : 'text-apple-ink/60 hover:bg-apple-gray/50 hover:text-apple-ink'
          }`}
        >
          <Settings size={18} strokeWidth={2.2} className={activeTab === 'settings' ? 'text-apple-blue' : 'text-apple-ink/40'} />
          <span className="tracking-tight">Configuración</span>
        </button>
      </div>
    </aside>
  );
}
