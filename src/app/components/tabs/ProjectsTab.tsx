import React from 'react';
import { Plus } from 'lucide-react';
import { ProjectCard } from '../ProjectCard';
import { projects } from '@/shared/db/schemas';

type ProjectWithNested = typeof projects.$inferSelect & {
  latestAudit?: {
    id: string;
    status: string;
  } | null;
  integrations?: unknown[] | null;
};

interface ProjectsTabProps {
  dashboardData: ProjectWithNested[];
  NewProjectModal: React.ComponentType;
}

export function ProjectsTab({ dashboardData, NewProjectModal }: ProjectsTabProps) {
  return (
    <div className="space-y-6 relative z-10 font-sans text-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight text-white">Listado Completo de Dominios</h2>
          <p className="text-xs text-zinc-500 mt-1">Administre y audite la infraestructura de los sitios web asignados a su cuenta corporativa.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboardData.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        
        {/* Empty project placeholder card */}
        <div className="border border-dashed border-white/[0.08] hover:border-cyan-500/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-6 transition-all min-h-[240px] bg-white/[0.005] group">
          <div className="w-14 h-14 rounded-xl bg-white/[0.02] flex items-center justify-center text-zinc-600 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all border border-white/[0.08] shadow-sm">
            <Plus className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h4 className="font-extrabold text-white text-[15px] tracking-tight">¿Agregar un nuevo dominio?</h4>
            <p className="text-xs text-zinc-500 max-w-[200px] mx-auto leading-relaxed">Somete tu sitio web a una auditoría técnica profunda impulsada por IA.</p>
          </div>
          <NewProjectModal />
        </div>
      </div>
    </div>
  );
}
