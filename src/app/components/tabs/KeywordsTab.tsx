import React from 'react';
import { TrendingUp, Search, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KeywordsTabProps {
  keywordsList: any[];
  keywordInput: string;
  setKeywordInput: (val: string) => void;
  handleAddKeyword: (e: React.FormEvent) => void;
}

export function KeywordsTab({ keywordsList, keywordInput, setKeywordInput, handleAddKeyword }: KeywordsTabProps) {
  return (
    <div className="space-y-12">
      {/* GSC Integrations Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { label: 'Impressions', value: '124.8K', change: '+14.2%', trend: 'up' },
          { label: 'Organic Clicks', value: '8,420', change: '+8.6%', trend: 'up' },
          { label: 'Avg. CTR', value: '6.74%', change: 'Stable', trend: 'stable' },
          { label: 'Avg. Position', value: '4.2', change: '+0.4', trend: 'up' },
        ].map((metric, i) => (
          <div key={i} className="glass-card rounded-apple-md p-8 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">{metric.label}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-apple-pill flex items-center gap-1 ${
                metric.trend === 'up' ? 'text-green-600 bg-green-500/10' : 'text-apple-ink/40 bg-apple-gray'
              }`}>
                {metric.trend === 'up' && <TrendingUp className="w-3 h-3" />} {metric.change}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tighter text-apple-ink leading-none">{metric.value}</span>
            </div>
            <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest">Google Search Console (30d)</p>
          </div>
        ))}
      </div>

      {/* Add keyword form */}
      <div className="glass-card rounded-apple-md p-10 shadow-sm">
        <div className="mb-8">
          <h3 className="font-bold text-apple-ink text-[17px] tracking-tight">Active Keyword Tracking</h3>
          <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest mt-1">Configure real-time monitoring for your domains</p>
        </div>
        <form onSubmit={handleAddKeyword} className="flex gap-4 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-ink/30" />
            <input 
              type="text" 
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="Add new keyword tracker..."
              className="w-full bg-apple-gray/50 border border-apple-gray-dark/10 rounded-apple-pill px-11 py-3 text-apple-ink text-sm focus:outline-none focus:border-apple-blue transition-all"
            />
          </div>
          <button 
            type="submit" 
            className="px-8 py-3 bg-apple-ink text-white text-[11px] font-bold uppercase tracking-widest rounded-apple-pill hover:bg-apple-blue transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Start Tracking
          </button>
        </form>
      </div>

      {/* Tracked keywords list */}
      <div className="glass-card rounded-apple-md overflow-hidden shadow-sm">
        <div className="p-8 border-b border-apple-gray-dark/5 bg-apple-gray/10">
          <h3 className="font-bold text-apple-ink text-[15px] tracking-tight">Keyword Performance Table</h3>
          <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest mt-0.5">Real-time ranking data</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-apple-gray-dark/5 bg-white/[0.005] text-[10px] font-bold uppercase text-apple-ink/30 tracking-widest">
                <th className="px-8 py-5">Keyword</th>
                <th className="px-8 py-5">Domain</th>
                <th className="px-8 py-5 text-center">Volume</th>
                <th className="px-8 py-5 text-center">KD%</th>
                <th className="px-8 py-5 text-center">Rank</th>
                <th className="px-8 py-5 text-center">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-dark/5 text-sm">
              {keywordsList.map((kw) => (
                <tr key={kw.id} className="hover:bg-apple-gray/20 transition-colors">
                  <td className="px-8 py-6">
                    <span className="font-bold text-apple-ink tracking-tight">{kw.keyword}</span>
                  </td>
                  <td className="px-8 py-6 text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest">{kw.project}</td>
                  <td className="px-8 py-6 text-center font-medium text-apple-ink/60">{kw.volume}</td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-2.5 py-1 rounded-apple-pill text-[10px] font-bold ${
                      kw.difficulty > 50 ? 'bg-red-500/10 text-red-600' :
                      kw.difficulty > 30 ? 'bg-amber-500/10 text-amber-600' :
                      'bg-green-500/10 text-green-600'
                    }`}>
                      {kw.difficulty}%
                    </span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="font-bold text-apple-blue text-lg tracking-tighter">#{kw.position}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center gap-1.5">
                      {kw.trend === 'up' && (
                        <span className="text-green-600 text-[11px] font-bold flex items-center bg-green-500/10 px-2 py-1 rounded-apple-pill"><ArrowUpRight className="w-3.5 h-3.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'down' && (
                        <span className="text-red-600 text-[11px] font-bold flex items-center bg-red-500/10 px-2 py-1 rounded-apple-pill"><ArrowDownRight className="w-3.5 h-3.5" /> {kw.change}</span>
                      )}
                      {kw.trend === 'stable' && (
                        <span className="text-apple-ink/40 text-[11px] font-bold bg-apple-gray px-2 py-1 rounded-apple-pill">{kw.change}</span>
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
