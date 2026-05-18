import React from 'react';
import Link from 'next/link';
import { Globe, ChevronRight, ShieldCheck } from 'lucide-react';
import { projects } from '@/shared/db/schemas';

interface ProjectCardProps {
  project: typeof projects.$inferSelect & {
    latestAudit?: {
      id: string;
      status: string;
    } | null;
    integrations?: unknown[] | null;
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const healthScore = project.latestAudit ? 85 : 45;

  const getHealthStyle = (score: number) => {
    if (score >= 80) {
      return {
        badge: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(52,211,153,0.15)]',
        indicator: 'bg-emerald-400'
      };
    }
    if (score >= 50) {
      return {
        badge: 'border-amber-500/20 text-amber-400 bg-amber-500/5 shadow-[0_0_15px_rgba(251,191,36,0.15)]',
        indicator: 'bg-amber-400'
      };
    }
    return {
      badge: 'border-rose-500/20 text-rose-400 bg-rose-500/5 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
      indicator: 'bg-rose-400'
    };
  };

  const healthStyle = getHealthStyle(healthScore);

  return (
    <Link href={`/projects/${project.id}`} className="block h-full cursor-pointer">
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 group hover:border-cyan-500/30 hover:scale-[1.01] transition-all duration-500 flex flex-col justify-between relative overflow-hidden h-full shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        {/* Neon top highlight */}
        <div className="absolute top-0 left-0 w-0 h-[2px] bg-cyan-500 group-hover:w-full transition-all duration-500" />
        
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-full blur-2xl pointer-events-none group-hover:from-cyan-500/10 transition-all duration-500" />
        
        {/* Header section */}
        <div className="flex items-start justify-between relative z-10 min-w-0 mb-6">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-[9px] font-extrabold text-cyan-400 tracking-widest uppercase mb-1 block">
              Dominio Protegido
            </span>
            <h3 className="text-lg font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors truncate" title={project.name}>
              {project.name}
            </h3>
            <p className="text-xs font-semibold text-zinc-500 tracking-tight truncate mt-0.5" title={project.domain}>
              {project.domain}
            </p>
          </div>
          
          {/* Neon health score circular badge */}
          <div className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center shrink-0 transition-all duration-500 ${healthStyle.badge}`}>
            <span className="text-[8px] text-zinc-500 font-extrabold tracking-wider -mb-0.5 uppercase">Score</span>
            <span className="text-sm font-black text-white">{healthScore}</span>
          </div>
        </div>

        {/* Indicators and tags */}
        <div className="flex items-center gap-4 text-xs font-semibold text-zinc-400 relative z-10 mb-6">
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.08] px-2.5 py-1 rounded-lg">
            {project.latestAudit?.status === 'completed' ? (
              <>
                <ShieldCheck size={14} className="text-emerald-400" />
                <span className="text-zinc-300 font-bold">Monitoreado</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-duration-1000"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="text-zinc-300 font-bold">Escaneando</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.08] px-2.5 py-1 rounded-lg">
            <Globe size={14} className="text-zinc-500" />
            <span className="text-zinc-300 font-bold">{project.integrations?.length || 0} Conexiones</span>
          </div>
        </div>

        {/* Action bar footer */}
        <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between relative z-10 mt-auto">
          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
            Sincronizado: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Nunca'}
          </span>
          <span className="text-xs text-cyan-400 font-extrabold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            Gestionar <ChevronRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
