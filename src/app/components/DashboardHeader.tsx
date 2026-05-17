import React from 'react';

interface DashboardHeaderProps {
  activeTab: string;
  NewProjectModal: any;
}

export function DashboardHeader({ activeTab, NewProjectModal }: DashboardHeaderProps) {
  const getTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Dashboard';
      case 'projects': return 'Proyectos';
      case 'performance': return 'Rendimiento';
      case 'keywords': return 'Keywords';
      case 'reports': return 'Reportes';
      case 'settings': return 'Ajustes';
      default: return 'Dashboard';
    }
  };

  const getSubtitle = () => {
    switch (activeTab) {
      case 'overview': return 'Vista general del sistema';
      case 'projects': return 'Administracion de dominios';
      case 'performance': return 'Core Web Vitals';
      case 'keywords': return 'Posicionamiento SERP';
      case 'reports': return 'Documentacion tecnica';
      case 'settings': return 'Cuenta y preferencias';
      default: return 'Vista general del sistema';
    }
  };

  return (
    <header className="h-20 bg-background/80 backdrop-blur-xl border-b border-apple-gray-dark/5 flex items-center justify-between px-10 sticky top-0 z-10 shrink-0">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold tracking-tight text-apple-ink">
          {getTitle()}
        </h1>
        <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest mt-0.5">
          {getSubtitle()}
        </p>
      </div>
      
      <div className="flex items-center gap-6">
        <NewProjectModal />
        <div className="w-10 h-10 rounded-apple-pill bg-apple-gray flex items-center justify-center cursor-pointer hover:bg-apple-gray-dark/10 transition-all border border-apple-gray-dark/5">
          <span className="text-xs font-bold text-apple-ink/60">JU</span>
        </div>
      </div>
    </header>
  );
}
