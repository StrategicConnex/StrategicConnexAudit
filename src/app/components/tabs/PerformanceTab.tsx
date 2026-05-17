import React from 'react';
import { RefreshCw, Gauge, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface PerformanceTabProps {
  dashboardData: any[];
}

export function PerformanceTab({ dashboardData }: PerformanceTabProps) {
  return (
    <div className="space-y-12">
      {/* Core Web Vitals Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {[
          { label: 'LCP', value: '1.8s', status: 'Optimized', health: 85, color: 'bg-apple-blue' },
          { label: 'CLS', value: '0.03', status: 'Stable', health: 92, color: 'bg-apple-blue' },
          { label: 'INP', value: '210ms', status: 'Improve', health: 65, color: 'bg-amber-500' },
          { label: 'Global', value: '91.4', status: 'Premium', health: 91, color: 'bg-apple-ink' },
        ].map((metric, i) => (
          <div key={i} className="glass-card rounded-apple-md p-8 flex flex-col gap-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">{metric.label}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-apple-pill ${
                metric.status === 'Optimized' || metric.status === 'Stable' || metric.status === 'Premium'
                  ? 'text-green-600 bg-green-500/10'
                  : 'text-amber-600 bg-amber-500/10'
              }`}>{metric.status}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tighter text-apple-ink leading-none">{metric.value}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-medium text-apple-ink/60">
                <span>{metric.label === 'Global' ? 'Lighthouse Score' : 'Score'}</span>
                <span>{metric.health}%</span>
              </div>
              <div className="w-full bg-apple-gray h-1.5 rounded-apple-pill overflow-hidden">
                <div className={`${metric.color} h-full rounded-apple-pill`} style={{ width: `${metric.health}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Speed insights list */}
      <div className="glass-card rounded-apple-md overflow-hidden shadow-sm">
        <div className="p-8 border-b border-apple-gray-dark/5 flex items-center justify-between bg-apple-gray/10">
          <div>
            <h3 className="font-bold text-apple-ink text-[15px] tracking-tight">Performance Breakdown</h3>
            <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest mt-0.5">Technical audit by domain</p>
          </div>
          <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-apple-ink/60 hover:text-apple-blue transition-colors px-4 py-2 rounded-apple-pill bg-apple-gray/50 border border-apple-gray-dark/10">
            <RefreshCw className="w-3.5 h-3.5" /> Sync Data
          </button>
        </div>

        <div className="divide-y divide-apple-gray-dark/5">
          {dashboardData.map((project, idx) => {
            const score = idx === 0 ? 94 : 85;
            const size = idx === 0 ? '1.4MB' : '2.1MB';
            const resTime = idx === 0 ? '120ms' : '240ms';
            return (
              <div key={project.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 hover:bg-apple-gray/20 transition-colors group">
                <div className="flex items-center gap-6 min-w-0">
                  <div className="w-12 h-12 rounded-apple-pill bg-apple-gray flex items-center justify-center text-apple-ink/40 group-hover:text-apple-blue transition-colors border border-apple-gray-dark/5">
                    <Gauge className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-apple-ink text-[15px] truncate">{project.name}</h4>
                    <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest truncate mt-0.5">{project.domain}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-12">
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-apple-ink/30 tracking-widest">Page Size</span>
                    <span className="text-[13px] font-bold text-apple-ink/60">{size}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-apple-ink/30 tracking-widest">Response</span>
                    <span className="text-[13px] font-bold text-apple-ink/60">{resTime}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-apple-ink/30 tracking-widest">Score</span>
                    <span className={`text-[13px] font-bold ${score >= 90 ? 'text-green-600' : 'text-amber-600'}`}>{score}/100</span>
                  </div>
                </div>

                <div className="mt-auto">
                  <Link 
                    href={`/projects/${project.id}`}
                    className="text-[11px] font-bold uppercase tracking-widest text-apple-blue flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0"
                  >
                    View Audit <ChevronRight size={14} strokeWidth={2.5} />
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
