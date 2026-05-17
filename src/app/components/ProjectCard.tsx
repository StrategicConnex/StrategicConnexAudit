import React from 'react';
import Link from 'next/link';
import { Activity, Globe, ChevronRight } from 'lucide-react';

interface ProjectCardProps {
  project: any;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const getHealthColor = (score: number) => {
    if (score > 80) return 'text-green-400 bg-green-500/10';
    if (score > 50) return 'text-amber-400 bg-amber-500/10';
    return 'text-red-400 bg-red-500/10';
  };

  const healthScore = project.latestAudit ? 85 : 45;

  return (
    <Link href={`/projects/${project.id}`} className="block h-full">
      <div className="glass-card rounded-apple-md p-8 group hover:shadow-lg hover:scale-[1.01] transition-all duration-500 cursor-pointer flex flex-col gap-8 relative overflow-hidden h-full shadow-sm">
        <div className="flex items-start justify-between relative z-10 min-w-0">
          <div className="min-w-0 flex-1 pr-3">
            <h3 className="text-xl font-bold tracking-tight text-apple-ink group-hover:text-apple-blue transition-colors truncate" title={project.name}>
              {project.name}
            </h3>
            <p className="text-[13px] font-medium text-apple-ink/40 tracking-tight truncate mt-1" title={project.domain}>{project.domain}</p>
          </div>
          <div className={`w-14 h-14 rounded-apple-pill flex items-center justify-center font-bold text-lg shrink-0 ${getHealthColor(healthScore)}`}>
            {healthScore}
          </div>
        </div>

        <div className="flex items-center gap-6 text-[12px] font-medium text-apple-ink/60 relative z-10">
          <div className="flex items-center gap-2 shrink-0">
            <Activity size={16} strokeWidth={2.2} className="text-apple-blue" />
            <span>{project.latestAudit?.status === 'completed' ? 'Auditado' : 'Analizando'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Globe size={16} strokeWidth={2.2} className="text-apple-ink/30" />
            <span>{project.integrations?.length || 0} Integraciones</span>
          </div>
        </div>

        <div className="pt-6 border-t border-apple-gray-dark/5 flex items-center justify-between relative z-10 mt-auto">
          <span className="text-[11px] font-medium text-apple-ink/30 uppercase tracking-widest">
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
          <span className="text-[13px] text-apple-blue font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            Gestionar <ChevronRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
