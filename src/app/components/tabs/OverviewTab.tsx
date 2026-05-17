import React from 'react';
import { Globe, ChevronRight } from 'lucide-react';
import { ProjectCard } from '../ProjectCard';

interface OverviewTabProps {
  initialProjects: any[];
  dashboardData: any[];
  setActiveTab: (tab: any) => void;
}

export function OverviewTab({ initialProjects, dashboardData, setActiveTab }: OverviewTabProps) {
  return (
    <>
      {/* Global KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="glass-card rounded-apple-md p-8 flex flex-col gap-3 relative overflow-hidden group hover:scale-[1.01] transition-all duration-500 shadow-sm">
          <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Proyectos</h3>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold tracking-tighter text-apple-ink leading-none">{initialProjects.length}</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-apple-pill bg-green-500/10 text-green-600 border border-green-500/20">
              +2 hoy
            </span>
          </div>
        </div>

        <div className="glass-card rounded-apple-md p-8 flex flex-col gap-3 relative overflow-hidden group hover:scale-[1.01] transition-all duration-500 shadow-sm">
          <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Auditorias</h3>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold tracking-tighter text-apple-ink leading-none">24</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-apple-pill bg-apple-blue/10 text-apple-blue border border-apple-blue/20">
              Sincronizado
            </span>
          </div>
        </div>

        <div className="glass-card rounded-apple-md p-8 flex flex-col gap-3 relative overflow-hidden group hover:scale-[1.01] transition-all duration-500 shadow-sm">
          <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Alertas</h3>
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold tracking-tighter text-apple-ink leading-none">4</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-apple-pill bg-red-500/10 text-red-600 border border-red-500/20">
              Requiere accion
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Proyectos Recientes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[19px] font-bold tracking-tight text-apple-ink flex items-center gap-3">
              <Globe className="w-5 h-5 text-apple-blue" /> Proyectos Activos
            </h2>
            <p className="text-[13px] text-apple-ink/40 mt-1">Monitoreo de salud tecnica SEO y Core Web Vitals en tiempo real.</p>
          </div>
          <button 
            onClick={() => setActiveTab('projects')}
            className="text-[11px] font-bold uppercase tracking-widest text-apple-blue hover:opacity-70 transition-all flex items-center gap-1.5"
          >
            Ver todos los proyectos <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {dashboardData.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </>
  );
}
