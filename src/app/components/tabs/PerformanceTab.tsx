import React from 'react';
import { RefreshCw, ChevronRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { projects } from '@/shared/db/schemas';

interface PerformanceTabProps {
  dashboardData: (typeof projects.$inferSelect)[];
}

export function PerformanceTab({ dashboardData }: PerformanceTabProps) {
  return (
    <div className="space-y-12 relative z-10 font-sans text-zinc-100">
      {/* Core Web Vitals Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {[
          { label: 'LCP (Largest Contentful Paint)', short: 'LCP', value: '1.8s', status: 'Optimized', health: 85, color: 'bg-gradient-to-r from-emerald-500 to-teal-400' },
          { label: 'CLS (Cumulative Layout Shift)', short: 'CLS', value: '0.03', status: 'Stable', health: 92, color: 'bg-gradient-to-r from-emerald-500 to-teal-400' },
          { label: 'INP (Interaction to Next Paint)', short: 'INP', value: '210ms', status: 'Improve', health: 65, color: 'bg-gradient-to-r from-amber-500 to-yellow-400' },
          { label: 'Global Performance Index', short: 'Global', value: '91.4', status: 'Premium', health: 91, color: 'bg-gradient-to-r from-cyan-500 to-blue-500' },
        ].map((metric, i) => (
          <div key={i} className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 flex flex-col gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{metric.short}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                metric.status === 'Optimized' || metric.status === 'Stable' || metric.status === 'Premium'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}>{metric.status}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tighter text-white leading-none">{metric.value}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                <span>{metric.short === 'Global' ? 'Lighthouse Score' : 'Score'}</span>
                <span className="text-white">{metric.health}%</span>
              </div>
              <div className="w-full bg-white/[0.04] h-2 rounded-full overflow-hidden p-[1px]">
                <div className={`${metric.color} h-full rounded-full`} style={{ width: `${metric.health}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Speed insights list */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="p-8 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.005]">
          <div>
            <h3 className="font-extrabold text-white text-base tracking-tight">Desglose de Rendimiento</h3>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Auditoría técnica avanzada por dominio</p>
          </div>
          <button className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 hover:text-cyan-400 transition-colors px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-cyan-500/30 hover:bg-white/[0.04] cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Sincronizar Datos
          </button>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {dashboardData.map((project, idx) => {
            const score = idx === 0 ? 94 : 85;
            const size = idx === 0 ? '1.4MB' : '2.1MB';
            const resTime = idx === 0 ? '120ms' : '240ms';
            return (
              <div key={project.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 hover:bg-white/[0.01] transition-colors group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[2px] h-0 bg-cyan-500 group-hover:h-full transition-all duration-300" />
                <div className="flex items-center gap-6 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.02] flex items-center justify-center text-zinc-500 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all border border-white/[0.08]">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-white text-base truncate tracking-tight">{project.name}</h4>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate mt-0.5">{project.domain}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-12">
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Peso de Página</span>
                    <span className="text-[13px] font-bold text-zinc-300">{size}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Respuesta</span>
                    <span className="text-[13px] font-bold text-zinc-300">{resTime}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Puntaje</span>
                    <span className={`text-[13px] font-extrabold ${score >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>{score}/100</span>
                  </div>
                </div>

                <div className="flex items-center">
                  <Link 
                    href={`/projects/${project.id}`}
                    className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 px-3.5 py-2 rounded-xl"
                  >
                    Ver Auditoría <ChevronRight size={14} strokeWidth={2.5} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
