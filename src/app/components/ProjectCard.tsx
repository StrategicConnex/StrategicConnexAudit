import React from 'react';
import Link from 'next/link';
import { Globe, ChevronRight, ShieldCheck, Activity } from 'lucide-react';
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
        badge: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.15)]',
        indicator: 'bg-emerald-400',
        glow: 'group-hover:bg-emerald-500/10'
      };
    }
    if (score >= 50) {
      return {
        badge: 'border-amber-500/20 text-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.15)]',
        indicator: 'bg-amber-400',
        glow: 'group-hover:bg-amber-500/10'
      };
    }
    return {
      badge: 'border-rose-500/20 text-rose-400 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.15)]',
      indicator: 'bg-rose-400',
      glow: 'group-hover:bg-rose-500/10'
    };
  };

  const healthStyle = getHealthStyle(healthScore);

  return (
    <Link href={`/projects/${project.id}`} className="block h-full cursor-pointer">
      <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 group hover:border-cyan-500/30 hover:scale-[1.01] transition-all duration-500 flex flex-col justify-between relative overflow-hidden h-full shadow-lg">
        {/* Neon top highlight */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        {/* Ambient background glow */}
        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-all duration-700 bg-transparent ${healthStyle.glow}`} />
        
        {/* Header section */}
        <div className="flex items-start justify-between relative z-10 min-w-0 mb-6">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              Nodo Protegido
            </span>
            <h3 className="text-lg font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors truncate" title={project.name}>
              {project.name}
            </h3>
            <p className="text-xs font-semibold text-zinc-500 tracking-tight truncate mt-0.5" title={project.domain}>
              {project.domain}
            </p>
          </div>
          
          {/* Health score circular badge */}
          <div className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center shrink-0 transition-all duration-500 ${healthStyle.badge}`}>
            <span className="text-[8px] font-extrabold tracking-wider -mb-0.5 uppercase opacity-80">Score</span>
            <span className="text-sm font-black text-white">{healthScore}</span>
          </div>
        </div>

        {/* Indicators and tags */}
        <div className="flex items-center gap-4 text-xs font-semibold text-zinc-400 relative z-10 mb-6">
          <div className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.04] px-2.5 py-1.5 rounded-md">
            {project.latestAudit?.status === 'completed' ? (
              <>
                <Activity size={14} className="text-emerald-400" />
                <span className="text-zinc-300 font-bold text-[10px] tracking-wide uppercase">Activo</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="text-zinc-300 font-bold text-[10px] tracking-wide uppercase ml-1">Escaneando</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.04] px-2.5 py-1.5 rounded-md">
            <Globe size={14} className="text-zinc-500" />
            <span className="text-zinc-300 font-bold text-[10px] tracking-wide uppercase">{project.integrations?.length || 0} Conex.</span>
          </div>
        </div>

        {/* Action bar footer */}
        <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between relative z-10 mt-auto">
          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
            Sync: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Never'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-extrabold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            Analizar <ChevronRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
