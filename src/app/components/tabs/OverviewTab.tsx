import React from 'react';
import { Globe, ChevronRight, Shield, Layers, ShieldAlert, Cpu, Terminal, Compass } from 'lucide-react';
import { ProjectCard } from '../ProjectCard';

interface OverviewTabProps {
  initialProjects: any[];
  dashboardData: any[];
  setActiveTab: (tab: any) => void;
}

export function OverviewTab({ initialProjects, dashboardData, setActiveTab }: OverviewTabProps) {
  return (
    <div className="space-y-10">
      {/* Global Bento Grid - KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Activos */}
        <div className="glass-card tech-grid rounded-xl p-6 relative overflow-hidden group hover:scale-[1.01] hover:border-cyan-500/20 transition-all duration-500 shadow-2xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Recursos Monitoreados
            </h3>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              +2 Hoy
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white tracking-tight">{initialProjects.length}</span>
            <span className="text-xs font-semibold text-slate-400">dominios</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Integraciones de dominio conectadas al motor de indexación automatizado.
          </p>
        </div>

        {/* Card 2: Auditorías */}
        <div className="glass-card tech-grid rounded-xl p-6 relative overflow-hidden group hover:scale-[1.01] hover:border-indigo-500/20 transition-all duration-500 shadow-2xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              Auditorías Ejecutadas
            </h3>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Estable
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white tracking-tight">24</span>
            <span className="text-xs font-semibold text-slate-400">ciclos</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Escaneos profundos de Core Web Vitals, indexabilidad y Core Errors.
          </p>
        </div>

        {/* Card 3: Alertas */}
        <div className="glass-card tech-grid rounded-xl p-6 relative overflow-hidden group hover:scale-[1.01] hover:border-red-500/20 transition-all duration-500 shadow-2xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-red-500/10 transition-all duration-500" />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              Vulnerabilidades
            </h3>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
              Acción Requerida
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white tracking-tight">4</span>
            <span className="text-xs font-semibold text-slate-400">incidentes</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Advertencias de SEO técnico y Core Web Vitals críticas detectadas.
          </p>
        </div>

      </div>

      {/* Compliance & AI-Powered Trust Banner */}
      <div className="glass-card tech-grid rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-l-2 border-l-[#06b6d4]">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-[#06b6d4] bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
              Seguridad de Nivel Empresarial
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold text-slate-400">Sincronizado con Google Search Console API</span>
          </div>
          <h4 className="text-sm font-bold text-white tracking-tight">
            Motor de Inteligencia Artificial Activo
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Nuestro sistema realiza análisis continuos basados en las directrices de calidad y core updates de Google, garantizando el cumplimiento técnico de SEO automatizado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
          <div className="text-center px-4 py-2 border-r border-white/[0.04]">
            <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Cumplimiento</p>
            <p className="text-xs font-bold text-white mt-1">SOC 2 compliant</p>
          </div>
          <div className="text-center px-4 py-2 border-r border-white/[0.04]">
            <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">W3C Estándar</p>
            <p className="text-xs font-bold text-white mt-1">Lighthouse v12</p>
          </div>
          <div className="text-center px-4 py-2">
            <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Protección</p>
            <p className="text-xs font-bold text-emerald-400 mt-1">SSL Activo</p>
          </div>
        </div>
      </div>

      {/* Grid de Proyectos Recientes */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#06b6d4]" />
              Proyectos en Monitoreo Activo
            </h2>
            <p className="text-xs text-slate-400 mt-1">Salud técnica de Core Web Vitals en tiempo real.</p>
          </div>
          <button 
            onClick={() => setActiveTab('projects')}
            className="text-[10px] font-bold uppercase tracking-widest text-[#06b6d4] hover:text-cyan-300 transition-colors flex items-center gap-1.5 group"
          >
            Ver todos los proyectos 
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {dashboardData.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}
