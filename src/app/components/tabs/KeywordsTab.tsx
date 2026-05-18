import React from 'react';
import { TrendingUp, Search, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface KeywordItem {
  id: string | number;
  keyword: string;
  project: string;
  volume: string | number;
  difficulty: number;
  position: number;
  trend: 'up' | 'down' | 'stable';
  change: string;
}

interface KeywordsTabProps {
  keywordsList: KeywordItem[];
  keywordInput: string;
  setKeywordInput: (val: string) => void;
  handleAddKeyword: (e: React.FormEvent) => void;
}

export function KeywordsTab({ keywordsList, keywordInput, setKeywordInput, handleAddKeyword }: KeywordsTabProps) {
  return (
    <div className="space-y-12 relative z-10 font-sans text-zinc-100">
      {/* GSC Integrations Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { label: 'Impressions', value: '124.8K', change: '+14.2%', trend: 'up' },
          { label: 'Organic Clicks', value: '8,420', change: '+8.6%', trend: 'up' },
          { label: 'Avg. CTR', value: '6.74%', change: 'Stable', trend: 'stable' },
          { label: 'Avg. Position', value: '4.2', change: '+0.4', trend: 'up' },
        ].map((metric, i) => (
          <div key={i} className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 flex flex-col gap-4 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{metric.label}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border ${
                metric.trend === 'up' 
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                  : 'text-zinc-400 bg-white/[0.03] border-white/[0.08]'
              }`}>
                {metric.trend === 'up' && <TrendingUp className="w-3 h-3" />} {metric.change}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tighter text-white leading-none">{metric.value}</span>
            </div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Google Search Console (30d)</p>
          </div>
        ))}
      </div>

      {/* Add keyword form */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="mb-8">
          <h3 className="font-extrabold text-white text-lg tracking-tight">Monitoreo Activo de Keywords</h3>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Configure el rastreo en tiempo real para sus dominios con análisis SEO impulsado por IA</p>
        </div>
        <form onSubmit={handleAddKeyword} className="flex gap-4 flex-col sm:flex-row relative z-10">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
            <input 
              type="text" 
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Ingrese una palabra clave para monitorear..."
              className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl pl-12 pr-4 py-3.5 text-zinc-200 text-sm focus:outline-none transition-all placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)]"
            />
          </div>
          <button 
            type="submit" 
            className="px-8 py-3.5 bg-cyan-500 text-black text-[11px] font-extrabold uppercase tracking-widest rounded-xl hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Empezar a Rastrear
          </button>
        </form>
      </div>

      {/* Tracked keywords list */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="p-8 border-b border-white/[0.06] bg-white/[0.005]">
          <h3 className="font-extrabold text-white text-base tracking-tight">Tabla de Rendimiento de Keywords</h3>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Métricas e históricos de posicionamiento en tiempo real</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.002] text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                <th className="px-8 py-5">Keyword</th>
                <th className="px-8 py-5">Dominio</th>
                <th className="px-8 py-5 text-center">Volumen</th>
                <th className="px-8 py-5 text-center">KD%</th>
                <th className="px-8 py-5 text-center">Posición</th>
                <th className="px-8 py-5 text-center">Cambio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-sm">
              {keywordsList.map((kw) => (
                <tr key={kw.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-8 py-6">
                    <span className="font-bold text-white tracking-tight text-[15px]">{kw.keyword}</span>
                  </td>
                  <td className="px-8 py-6 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{kw.project}</td>
                  <td className="px-8 py-6 text-center font-bold text-zinc-300">{kw.volume}</td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      kw.difficulty > 50 ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      kw.difficulty > 30 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {kw.difficulty}%
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="font-extrabold text-cyan-400 text-lg tracking-tighter">#{kw.position}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center gap-1.5">
                      {kw.trend === 'up' && (
                        <span className="text-emerald-400 text-[11px] font-bold flex items-center bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full"><ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'down' && (
                        <span className="text-rose-400 text-[11px] font-bold flex items-center bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full"><ArrowDownRight className="w-3.5 h-3.5 mr-0.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'stable' && (
                        <span className="text-zinc-400 text-[11px] font-bold bg-white/[0.03] border border-white/[0.06] px-2.5 py-1 rounded-full">{kw.change}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
