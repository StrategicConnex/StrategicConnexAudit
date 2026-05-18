import React from 'react';

interface DashboardHeaderProps {
  activeTab: string;
  NewProjectModal: React.ComponentType;
}

export function DashboardHeader({ activeTab, NewProjectModal }: DashboardHeaderProps) {
  const getTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Dashboard';
      case 'projects': return 'Proyectos';
      case 'performance': return 'Rendimiento';
      case 'keywords': return 'Keywords';
      case 'reports': return 'Reportes AI';
      case 'intelligence': return 'Inteligencia';
      case 'monitoring': return 'Controles Activos';
      case 'settings': return 'Ajustes';
      default: return 'Dashboard';
    }
  };

  const getSubtitle = () => {
    switch (activeTab) {
      case 'overview': return 'Vista general del sistema';
      case 'projects': return 'Administración de dominios';
      case 'performance': return 'Core Web Vitals & Auditoría';
      case 'keywords': return 'Posicionamiento SERP';
      case 'reports': return 'Documentación técnica e Insights';
      case 'intelligence': return 'Análisis de Red e Infraestructura';
      case 'monitoring': return 'Monitoreo de Seguridad & APIs';
      case 'settings': return 'Cuenta y preferencias';
      default: return 'Vista general del sistema';
    }
  };

  return (
    <header className="h-20 bg-[#030303]/60 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-10 sticky top-0 z-20 shrink-0">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold tracking-tight text-white">
          {getTitle()}
        </h1>
        <p className="text-[9px] font-extrabold text-[#06b6d4] uppercase tracking-widest mt-0.5">
          {getSubtitle()}
        </p>
      </div>
      
      <div className="flex items-center gap-6">
        <NewProjectModal />
        <div className="w-9 h-9 rounded-full bg-white/[0.03] hover:bg-white/[0.08] flex items-center justify-center cursor-pointer transition-all duration-300 border border-white/[0.05] relative group shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">JU</span>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#030303] rounded-full" />
        </div>
      </div>
    </header>
  );
}
