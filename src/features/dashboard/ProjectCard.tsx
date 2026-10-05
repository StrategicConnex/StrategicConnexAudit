import React from "react";
import Link from "next/link";
import { Globe, ChevronRight, ShieldCheck, Activity } from "lucide-react";
import type { ProjectWithNested } from "@/shared/db/types";

interface ProjectCardProps {
  project: ProjectWithNested;
}

/* ─── Design-system-aware health score style ─────────────── */
function getHealthStyle(score: number) {
  const WARM_AMBER = "oklch(75% 0.13 80)";
  if (score >= 80) {
    return {
      badge: "border-chartreuse/20 text-chartreuse bg-chartreuse/10",
      glow: "group-hover:bg-chartreuse/10",
    };
  }
  if (score >= 50) {
    return {
      badge: `border-[${WARM_AMBER}]/20 text-[${WARM_AMBER}] bg-[${WARM_AMBER}]/10`,
      glow: `group-hover:bg-[${WARM_AMBER}]/10`,
    };
  }
  return {
    badge: "border-destructive/20 text-destructive bg-destructive/10",
    glow: "group-hover:bg-destructive/10",
  };
}

const NEUTRAL_STYLE = {
  badge: "border-border text-muted-fg bg-muted/10",
  glow: "group-hover:bg-muted/10",
};

export function ProjectCard({ project }: ProjectCardProps) {
  // Score real calculado en el servidor desde los issues de la última
  // auditoría completada. Sin datos → '—' honesto, nunca una cifra inventada.
  const healthScore = project.latestAudit?.healthScore ?? null;
  const healthStyle = healthScore != null ? getHealthStyle(healthScore) : NEUTRAL_STYLE;
  const auditStatus = project.latestAudit?.status ?? null;
  const criticalIssues = project.latestAudit?.criticalIssues ?? 0;
  const warningIssues = project.latestAudit?.warningIssues ?? 0;
  const totalIssues = criticalIssues + warningIssues;
  // Dominios .example.com están reservados para documentación (RFC 2606):
  // si aparecen aquí son fixtures de demo, no sitios reales. Se etiquetan.
  const isDemo = /\.example\.com$/i.test(project.domain || "");

  return (
    <Link href={`/projects/${project.id}`} className="block h-full cursor-pointer">
      <div className="glass-card rounded-2xl p-6 group hover:scale-[1.01] transition-transform duration-500 flex flex-col justify-between relative overflow-hidden h-full">
        {/* Neon top highlight */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Ambient background glow */}
        <div
          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${healthStyle.glow}`}
        />

        {/* Header section */}
        <div className="flex items-start justify-between relative z-10 min-w-0 mb-6">
          <div className="min-w-0 flex-1 pr-4">
            <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-primary" />
              Nodo Protegido
            </span>
            <h3
              className="text-lg font-black tracking-tight text-foreground group-hover:text-primary transition-colors truncate"
              title={project.name}
            >
              {project.name}
            </h3>
            {isDemo && (
              <span className="inline-flex w-fit mt-1.5 text-2xs font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border border-dashed border-muted-fg/40 text-muted-fg">
                Demo
              </span>
            )}
            <p
              className="text-xs font-semibold text-muted-fg tracking-tight truncate mt-0.5"
              title={project.domain}
            >
              {project.domain}
            </p>
          </div>

          {/* Health score circular badge */}
          <div
            className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center shrink-0 transition-[color,border-color,opacity] duration-500 ${healthStyle.badge}`}
          >
            <span className="text-2xs font-extrabold tracking-wider -mb-0.5 uppercase opacity-80">
              {healthScore ?? "—"}
            </span>
          </div>
        </div>

        {/* Indicators and tags */}
        <div className="flex items-center gap-4 text-xs font-semibold text-muted-fg relative z-10 mb-6">
          <div className="flex items-center gap-2 bg-muted/10 border border-border/50 px-2.5 py-1.5 rounded-md">
            {auditStatus === "completed" ? (
              <>
                <Activity size={14} className="text-chartreuse" />
                <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase">
                  Activo
                </span>
              </>
            ) : auditStatus === "running" ? (
              <>
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase ml-1">
                  Escaneando
                </span>
              </>
            ) : auditStatus === "pending" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-chart-warning ml-1" />
                <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase ml-1">
                  En cola
                </span>
              </>
            ) : auditStatus === "failed" || auditStatus === "canceled" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-destructive ml-1" />
                <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase ml-1">
                  Fallido
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-muted-fg/50 ml-1" />
                <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase ml-1">
                  Sin escanear
                </span>
              </>
            )}
          </div>
          {/* Desglose del score: los issues que lo componen. Sin issues no se
              muestra nada en lugar de un "0 / 0" que confunde. */}
          {totalIssues > 0 && (
            <div className="flex items-center gap-1.5 bg-muted/10 border border-border/50 px-2.5 py-1.5 rounded-md">
              {criticalIssues > 0 && (
                <>
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase">
                    {criticalIssues} Crít.
                  </span>
                </>
              )}
              {warningIssues > 0 && (
                <>
                  <span className="h-2 w-2 rounded-full bg-chart-warning" />
                  <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase">
                    {warningIssues} Adv.
                  </span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-muted/10 border border-border/50 px-2.5 py-1.5 rounded-md">
            <Globe size={14} className="text-muted-fg" />
            <span className="text-foreground/80 font-bold text-2xs tracking-wide uppercase">
              {project.integrations?.length || 0} Conex.
            </span>
          </div>
        </div>

        {/* Action bar footer */}
        <div className="pt-4 border-t border-border/50 flex items-center justify-between relative z-10 mt-auto">
          <span className="text-2xs font-bold text-muted-fg/60 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-fg/40" />
            Sync:{" "}
            {project.updatedAt
              ? new Date(project.updatedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })
              : "Nunca"}
          </span>
          <span className="text-2xs uppercase tracking-widest text-primary font-extrabold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-[color,opacity,transform] transform translate-x-2 group-hover:translate-x-0">
            Analizar <ChevronRight size={14} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}
