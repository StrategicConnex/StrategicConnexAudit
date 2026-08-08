import React from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('keywords');
  return (
    <div className="space-y-12 relative z-10 font-sans text-foreground">
      {/* Page title — h1 lives in DashboardHeader; this is the in-content h2 */}
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-white">{t('pageTitle')}</h2>
        <p className="text-xs text-muted-fg mt-1">{t('pageSubtitle')}</p>
      </div>

      {/* GSC Integrations Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { label: t('metricImpressions'), value: '124.8K', change: '+14.2%', trend: 'up' },
          { label: t('metricClicks'), value: '8,420', change: '+8.6%', trend: 'up' },
          { label: t('metricCtr'), value: '6.74%', change: t('metricStable'), trend: 'stable' },
          { label: t('metricPosition'), value: '4.2', change: '+0.4', trend: 'up' },
        ].map((metric, i) => (
          <div key={i} className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 flex flex-col gap-4 ">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{metric.label}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border ${
                metric.trend === 'up' 
                  ? 'text-chartreuse bg-chartreuse/10 border-chartreuse/20' 
                  : 'text-muted-fg bg-muted/20 border-border'
              }`}>
                {metric.trend === 'up' && <TrendingUp className="w-3 h-3" />} {metric.change}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tighter text-white leading-none">{metric.value}</span>
            </div>
            <p className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">{t('metricSource')}</p>
          </div>
        ))}
      </div>

      {/* Add keyword form */}
      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-10  relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="mb-8">
          <h3 className="font-extrabold text-white text-lg tracking-tight">{t('monitorTitle')}</h3>
          <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-1">{t('monitorDesc')}</p>
        </div>
        <form onSubmit={handleAddKeyword} className="flex gap-4 flex-col sm:flex-row relative z-10">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-fg" />
            <input 
              type="text" 
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder={t('inputPlaceholder')}
              className="w-full bg-card border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3.5 text-foreground/80 text-sm focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-600 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
            />
          </div>
          <button 
            type="submit" 
            className="px-8 py-3.5 bg-cyan-500 text-black text-[11px] font-extrabold uppercase tracking-widest rounded-xl hover:bg-cyan-400 transition-[color,background-color,box-shadow] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(98,113,196,0.3)] hover:shadow-[0_0_25px_rgba(98,113,196,0.45)] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> {t('startTrackingButton')}
          </button>
        </form>
      </div>

      {/* Tracked keywords list */}
      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl overflow-hidden ">
        <div className="p-8 border-b border-border bg-muted/1">
          <h3 className="font-extrabold text-white text-base tracking-tight">{t('tableTitle')}</h3>
          <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">{t('tableDesc')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/1 text-[10px] font-bold uppercase text-muted-fg tracking-wider">
                <th className="px-8 py-5">{t('colKeyword')}</th>
                <th className="px-8 py-5">{t('colDomain')}</th>
                <th className="px-8 py-5 text-center">{t('colVolume')}</th>
                <th className="px-8 py-5 text-center">{t('colDifficulty')}</th>
                <th className="px-8 py-5 text-center">{t('colPosition')}</th>
                <th className="px-8 py-5 text-center">{t('colChange')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] text-sm">
              {keywordsList.map((kw) => (
                <tr key={kw.id} className="hover:bg-muted/5 transition-colors">
                  <td className="px-8 py-6">
                    <span className="font-bold text-white tracking-tight text-[15px]">{kw.keyword}</span>
                  </td>
                  <td className="px-8 py-6 text-[10px] font-bold text-muted-fg uppercase tracking-wider">{kw.project}</td>
                  <td className="px-8 py-6 text-center font-bold text-foreground/80">{kw.volume}</td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      kw.difficulty > 50 ? 'bg-destructive/10 text-destructive border-destructive/20' :
                      kw.difficulty > 30 ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20' :
                      'bg-chartreuse/10 text-chartreuse border-chartreuse/20'
                    }`}>
                      {kw.difficulty}%
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="font-extrabold text-primary text-lg tracking-tighter">#{kw.position}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center gap-1.5">
                      {kw.trend === 'up' && (
                        <span className="text-chartreuse text-[11px] font-bold flex items-center bg-chartreuse/10 border border-chartreuse/20 px-2.5 py-1 rounded-full"><ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'down' && (
                        <span className="text-destructive text-[11px] font-bold flex items-center bg-destructive/10 border border-destructive/20 px-2.5 py-1 rounded-full"><ArrowDownRight className="w-3.5 h-3.5 mr-0.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'stable' && (
                        <span className="text-muted-fg text-[11px] font-bold bg-muted/20 border border-border px-2.5 py-1 rounded-full">{kw.change}</span>
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
