'use client';

import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, Settings,
  Zap, ShieldAlert, Sparkles, ShieldCheck
} from 'lucide-react';
import dynamic from 'next/dynamic';

const AiCoreVisual = dynamic(() => import('./AiCoreVisual'), { ssr: false });


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
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 group border cursor-pointer ${
        isActive
          ? 'bg-white/[0.03] text-foreground border-white/[0.05] shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
          : 'text-slate-400 border-transparent hover:bg-white/[0.015] hover:text-foreground hover:border-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={isActive ? 'text-[#06b6d4] drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'text-slate-500 group-hover:text-[#06b6d4] transition-colors duration-300'}>
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
    <aside className="w-66 bg-[#040406]/60 backdrop-blur-2xl border-r border-white/[0.04] hidden md:flex flex-col shrink-0 relative overflow-hidden">
      {/* Top Ambient Glow in Sidebar */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-24 bg-gradient-to-b from-[#818cf8]/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Logo Area */}
      <div className="h-20 flex items-center px-6 shrink-0 z-10 border-b border-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 flex items-center justify-center relative group">
            <AiCoreVisual size={38} interactive={true} />
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="font-extrabold text-[15px] tracking-tight text-white flex items-center gap-1.5">
              StrategicAudit
            </span>
            <span className="text-[10px] text-[#06b6d4] font-extrabold tracking-widest uppercase opacity-90 flex items-center gap-1">
              PRO <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 scan-pulse inline-block" />
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
          badge={<span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Live</span>}
          onClick={() => onTabChange('overview')}
        />

        <NavButton
          tab="projects"
          activeTab={activeTab}
          icon={<Globe size={18} strokeWidth={2} />}
          label="Proyectos"
          badge={<span className="text-[10px] bg-white/[0.04] text-white border border-white/[0.05] px-2.5 py-0.5 rounded-full font-bold">{projectCount}</span>}
          onClick={() => onTabChange('projects')}
        />

        <NavButton
          tab="performance"
          activeTab={activeTab}
          icon={<Activity size={18} strokeWidth={2} />}
          label="Rendimiento"
          badge={<span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">92%</span>}
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
          badge={<span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Audit</span>}
          onClick={() => onTabChange('reports')}
        />
      </nav>

      {/* Live AI Scanner Status Card */}
      <div className="mx-4 my-2 p-4 rounded-xl border border-white/[0.04] bg-white/[0.015] space-y-3 relative overflow-hidden group z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="flex items-center justify-between relative z-10">
          <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase">Copilot Engine</span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-cyan-400 font-bold">ACTIVE</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 scan-pulse" />
          </div>
        </div>
        <div className="space-y-1 relative z-10">
          <div className="text-[12px] font-bold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-cyan-400" /> Continuous Audit
          </div>
          <div className="text-[10px] text-slate-500">Security Index: 99.98%</div>
        </div>
      </div>

      {/* Settings Footer */}
      <div className="p-4 border-t border-white/[0.02] shrink-0 z-10">
        <button
          onClick={() => onTabChange('settings')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-300 border cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-white/[0.03] text-foreground border-white/[0.05] shadow-[0_2px_12px_rgba(0,0,0,0.5)]'
              : 'text-slate-400 border-transparent hover:bg-white/[0.015] hover:text-foreground hover:border-white/[0.02]'
          }`}
        >
          <Settings size={18} strokeWidth={2} className={activeTab === 'settings' ? 'text-[#06b6d4]' : 'text-slate-500'} />
          <span className="tracking-tight">Configuración</span>
        </button>
      </div>
    </aside>
  );
}
