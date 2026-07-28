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

/* ─── Design-system-aware health score style ─────────────── */
function getHealthStyle(score: number) {
  const WARM_AMBER = 'oklch(75% 0.13 80)';
  if (score >= 80) {
    return {
      badge: 'border-chartreuse/20 text-chartreuse bg-chartreuse/10',
      glow: 'group-hover:bg-chartreuse/10',
    };
  }
  if (score >= 50) {
    return {
      badge: `border-[${WARM_AMBER}]/20 text-[${WARM_AMBER}] bg-[${WARM_AMBER}]/10`,
      glow: `group-hover:bg-[${WARM_AMBER}]/10`,
    };
  }
  return {
    badge: 'border-destructive/20 text-destructive bg-destructive/10',
    glow: 'group-hover:bg-destructive/10',
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const healthScore = project.latestAudit ? 85 : 45;
  const healthStyle = getHealthStyle(healthScore);

  return (
    <Link href={`/projects/${project.id}`} className="block h-full cursor-pointer">
      <div className="glass-card rounded-2xl p-6 group hover:scale-[1.01] transition-all duration-500 flex flex-col justify-between relative overflow-hidden h-full">
        {/* Neon top highlight */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Ambient background glow */}
        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${healthStyle.glow}`} />

        {/* Header section */}
        <div className="flex items-start justify-between relative z-10 min-w-0 mb-6">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-primary" />
              Nodo Protegido
            </span>
            <h3 className="text-lg font-black tracking-tight text-foreground group-hover:text-primary transition-colors truncate" title={project.name}>
              {project.name}
            </h3>
            <p className="text-xs font-semibold text-muted-fg tracking-tight truncate mt-0.5" title={project.domain}>
              {project.domain}
            </p>
          </div>

          {/* Health score circular badge */}
          <div className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center shrink-0 transition-all duration-500 ${healthStyle.badge}`}>
            <span className="text-[8px] font-extrabold tracking-wider -mb-0.5 uppercase opacity-80">{healthScore}</span>
          </div>
        </div>

        {/* Indicators and tags */}
        <div className="flex items-center gap-4 text-xs font-semibold text-muted-fg relative z-10 mb-6">
          <div className="flex items-center gap-2 bg-muted/10 border border-border/50 px-2.5 py-1.5 rounded-md">
            {project.latestAudit?.status === 'completed' ? (
              <>
                <Activity size={14} className="text-chartreuse" />
                <span className="text-foreground/80 font-bold text-[10px] tracking-wide uppercase">Activo</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-foreground/80 font-bold text-[10px] tracking-wide uppercase ml-1">Escaneando</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 bg-muted/10 border border-border/50 px-2.5 py-1.5 rounded-md">
            <Globe size={14} className="text-muted-fg" />
            <span className="text-foreground/80 font-bold text-[10px] tracking-wide uppercase">{project.integrations?.length || 0} Conex.</span>
          </div>
        </div>

        {/* Action bar footer */}
        <div className="pt-4 border-t border-border/50 flex items-center justify-between relative z-10 mt-auto">
          <span className="text-[9px] font-bold text-muted-fg/60 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-fg/40" />
            Sync: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Never'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-primary font-extrabold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
            Analizar <ChevronRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
