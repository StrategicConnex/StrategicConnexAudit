import React from 'react';
import { InstallPwaButton } from './InstallPwaButton';
import { ThemeSwitcher } from "@/shared/design-system";

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
    <header className="h-14 bg-background/60 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-3 sm:px-10 sticky top-0 z-20 shrink-0">
      <div key={activeTab} className="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-300">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          {getTitle()}
        </h1>
        <p className="hidden sm:block text-[9px] font-extrabold text-primary uppercase tracking-widest mt-0.5">
          {getSubtitle()}
        </p>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-6">
        <InstallPwaButton />
        <ThemeSwitcher compact />
        <NewProjectModal />
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-muted/20 hover:bg-muted/40 items-center justify-center cursor-pointer transition-colors duration-300 border border-border/40 relative group">
          <span className="text-xs font-bold text-foreground/80 group-hover:text-foreground transition-colors">JU</span>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-chartreuse border-2 border-background rounded-full" />
        </div>
      </div>
    </header>
  );
}
