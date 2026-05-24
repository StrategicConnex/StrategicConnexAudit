import React from 'react';
import { 
  Globe, ChevronRight, Shield, Layers, ShieldAlert, Activity, 
  Terminal, Server, Zap, CheckCircle2, Lock, ArrowUpRight
} from 'lucide-react';
import { ProjectCard } from '../ProjectCard';
import { projects } from '@/shared/db/schemas';

export type ProjectWithNested = typeof projects.$inferSelect & {
  latestAudit?: {
    id: string;
    status: string;
  } | null;
  integrations?: unknown[] | null;
};

interface OverviewTabProps {
  initialProjects: ProjectWithNested[];
  dashboardData: ProjectWithNested[];
  setActiveTab: (tab: string) => void;
}

export function OverviewTab({ initialProjects, dashboardData, setActiveTab }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      
      {/* 1. TOP ROW: HIGH-DENSITY KPI CARDS WITH SPARKLINES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Active Nodes Card */}
        <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 relative overflow-hidden group hover:border-cyan-500/30 transition-all duration-500 shadow-lg">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-700" />
          
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              Nodos Activos
            </h3>
            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>
          <div className="flex items-end justify-between relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white tracking-tight">{initialProjects.length}</span>
              <span className="text-xs font-semibold text-zinc-500">/ 50 limit</span>
            </div>
            
            {/* Miniature Bar Chart Simulation */}
            <div className="flex items-end gap-1 h-8 opacity-70">
              {[40, 60, 45, 80, 50, 90, 70].map((h, i) => (
                <div key={i} className="w-1.5 bg-cyan-500/40 rounded-t-sm" style={{ height: `${h}%` }}>
                  <div className="w-full bg-cyan-400 rounded-t-sm" style={{ height: '30%' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Health Score Card */}
        <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500 shadow-lg">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-700" />
          
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Salud Global de Indexación
            </h3>
            <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" /> +2.4%
            </span>
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-white tracking-tight">92</span>
              <span className="text-sm font-bold text-zinc-500">/100</span>
            </div>
            
            {/* Radial Progress Mini */}
            <div className="relative w-12 h-12">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-white/[0.05]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-emerald-400" strokeDasharray="92, 100" strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
            </div>
          </div>
        </div>

        {/* Security Alerts Card */}
        <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 relative overflow-hidden group hover:border-rose-500/30 transition-all duration-500 shadow-lg">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-rose-500/10 transition-all duration-700" />
          
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Alertas de Seguridad
            </h3>
            <span className="flex items-center gap-1 text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
              Acción Requerida
            </span>
          </div>
          <div className="flex items-end justify-between relative z-10">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-white tracking-tight">4</span>
              <span className="text-xs font-semibold text-zinc-500">críticas</span>
            </div>
            
            {/* Horizontal Distribution Bar */}
            <div className="w-24 h-1.5 rounded-full bg-white/[0.05] flex overflow-hidden">
              <div className="h-full bg-rose-500 w-[20%]" title="Críticas" />
              <div className="h-full bg-amber-500 w-[30%]" title="Advertencias" />
              <div className="h-full bg-cyan-500 w-[50%]" title="Info" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. MIDDLE ROW: BENTO GRID COMMAND CENTER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart Area (Spans 2 columns) */}
        <div className="lg:col-span-2 backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 relative overflow-hidden group hover:border-cyan-500/20 transition-all duration-500 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Telemetría de Flota (30 Días)
              </h3>
              <p className="text-sm font-bold text-white tracking-tight">LCP Promedio vs Auditorías Ejecutadas</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Auditorías</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">LCP (ms)</span>
              </div>
            </div>
          </div>
          
          {/* Simulated Area Chart SVG */}
          <div className="relative h-48 w-full border-b border-l border-white/[0.05] mt-4">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="gradientCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="gradientIndigo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                  </linearGradient>
                </defs>
                
                {/* Grid Lines */}
                <path d="M0 25 H100 M0 50 H100 M0 75 H100" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" fill="none" />
                
                {/* Data Line 1 (Audits) */}
                <path d="M0 80 Q 10 70, 20 75 T 40 60 T 60 40 T 80 50 T 100 30" stroke="#22d3ee" strokeWidth="1.5" fill="none" className="drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                <path d="M0 80 Q 10 70, 20 75 T 40 60 T 60 40 T 80 50 T 100 30 L 100 100 L 0 100 Z" fill="url(#gradientCyan)" />
                
                {/* Data Line 2 (LCP) */}
                <path d="M0 60 Q 15 50, 30 65 T 50 45 T 70 55 T 90 35 T 100 40" stroke="#818cf8" strokeWidth="1.5" fill="none" className="drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                <path d="M0 60 Q 15 50, 30 65 T 50 45 T 70 55 T 90 35 T 100 40 L 100 100 L 0 100 Z" fill="url(#gradientIndigo)" />
              </svg>
            
            {/* X-Axis Labels */}
            <div className="absolute -bottom-6 w-full flex justify-between text-[9px] font-bold text-zinc-600 tracking-widest">
              <span>1 MAY</span>
              <span>8 MAY</span>
              <span>15 MAY</span>
              <span>22 MAY</span>
              <span>HOY</span>
            </div>
          </div>
        </div>

        {/* Activity Terminal */}
        <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 relative overflow-hidden group hover:border-cyan-500/20 transition-all duration-500 shadow-lg flex flex-col">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 mb-4">
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            Activity Log
          </h3>
          
          <div className="flex-1 bg-[#05080f] rounded-xl border border-white/[0.02] p-4 overflow-hidden font-mono text-[10px] space-y-3 relative">
            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] z-10" />
            
            <div className="flex gap-3 text-emerald-400">
              <span className="text-zinc-600">18:42:01</span>
              <span>[OK] Crawl complete for domain-a.com (2.4s)</span>
            </div>
            <div className="flex gap-3 text-rose-400">
              <span className="text-zinc-600">18:40:15</span>
              <span>[WARN] CLS threshold exceeded on domain-b.net (0.24)</span>
            </div>
            <div className="flex gap-3 text-cyan-400">
              <span className="text-zinc-600">18:35:50</span>
              <span>[INFO] Syncing GSC data for 12 properties...</span>
            </div>
            <div className="flex gap-3 text-emerald-400">
              <span className="text-zinc-600">18:35:54</span>
              <span>[OK] GSC Sync complete.</span>
            </div>
            <div className="flex gap-3 text-zinc-400">
              <span className="text-zinc-600">18:30:00</span>
              <span>[SYS] Automated audit cycle initiated.</span>
            </div>
            
            <div className="absolute bottom-4 left-4 flex items-center gap-2 text-zinc-500 animate-pulse">
              <span className="w-1.5 h-3 bg-zinc-400 block" /> Listening...
            </div>
          </div>
        </div>
      </div>

      {/* 3. COMPLIANCE & TRUST BANNER */}
      <div className="backdrop-blur-xl bg-[#0A0E17]/80 border border-white/[0.04] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden group">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
        
        <div className="space-y-1.5 max-w-xl pl-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
              <Lock className="w-3 h-3" /> Nivel Enterprise
            </span>
            <span className="w-1 h-1 rounded-full bg-zinc-600" />
            <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">GSC API SYNC ACTIVE</span>
          </div>
          <h4 className="text-sm font-bold text-white tracking-tight">
            Motor de Inteligencia Activo
          </h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Nuestro sistema realiza análisis continuos basados en las directrices de calidad y core updates de Google, garantizando el cumplimiento técnico de SEO automatizado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl">
          <div className="text-center px-4 py-1 border-r border-white/[0.04]">
            <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Compliance</p>
            <p className="text-xs font-bold text-white mt-0.5">SOC 2</p>
          </div>
          <div className="text-center px-4 py-1 border-r border-white/[0.04]">
            <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Estándar</p>
            <p className="text-xs font-bold text-white mt-0.5">Lighthouse 12</p>
          </div>
          <div className="text-center px-4 py-1">
            <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">Estado</p>
            <p className="text-xs font-bold text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Seguro
            </p>
          </div>
        </div>
      </div>

      {/* 4. RECENT PROJECTS GRID */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Nodos de Monitoreo
            </h2>
            <p className="text-xs text-zinc-500 mt-1 font-medium tracking-wide">Salud técnica de Core Web Vitals en tiempo real.</p>
          </div>
          <button 
            onClick={() => setActiveTab('projects')}
            className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5 group bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-md border border-cyan-500/20"
          >
            Explorar Red 
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
