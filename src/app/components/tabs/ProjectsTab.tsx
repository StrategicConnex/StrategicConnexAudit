import React from 'react';
import { Plus } from 'lucide-react';
import { ProjectCard } from '../ProjectCard';

interface ProjectsTabProps {
  dashboardData: any[];
  NewProjectModal: any;
}

export function ProjectsTab({ dashboardData, NewProjectModal }: ProjectsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight text-apple-ink">Listado Completo de Dominios</h2>
          <p className="text-[13px] text-apple-ink/40 mt-1">Administra y analiza los sitios web asignados a tu cuenta de agencia.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboardData.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
        
        {/* Empty project placeholder card */}
        <div className="border border-dashed border-apple-gray-dark/20 hover:border-apple-blue/40 rounded-apple-md p-8 flex flex-col items-center justify-center text-center gap-6 transition-all min-h-[240px] bg-apple-white group">
          <div className="w-14 h-14 rounded-apple-pill bg-apple-gray flex items-center justify-center text-apple-ink/20 group-hover:text-apple-blue transition-colors border border-apple-gray-dark/5 shadow-sm">
            <Plus className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-apple-ink text-[15px] tracking-tight">Agregar nuevo dominio?</h4>
            <p className="text-[13px] text-apple-ink/40 max-w-[200px] mx-auto leading-relaxed">Somete tu sitio a un escaneo profundo en segundos.</p>
          </div>
          <NewProjectModal />
        </div>
      </div>
    </div>
  );
}
