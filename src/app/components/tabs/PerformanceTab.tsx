import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, ChevronRight, Info, Settings, MoreVertical, 
  Globe, Terminal
} from 'lucide-react';
import Link from 'next/link';
import { projects } from '@/shared/db/schemas';

interface PerformanceTabProps {
  dashboardData: (typeof projects.$inferSelect)[];
}

export function PerformanceTab({ dashboardData }: PerformanceTabProps) {
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState('May 24, 2026 18:00 GMT');

  // Keep a dynamic simulated clock to make the dashboard feel active and alive
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      };
      setCurrentTime(d.toLocaleDateString('en-US', options));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 1200);
  };

  return (
    <div className="space-y-8 relative z-10 font-sans text-zinc-100 pb-12">
      {/* ─── Dashboard Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-white/[0.04] bg-[#07111f]/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-indigo-500/5 to-transparent opacity-50 pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              StrategicAudit Pro <span className="text-zinc-500 font-light text-base">Dashboard</span>
              <span className="text-zinc-500 text-sm">|</span>
              <span className="text-zinc-300 font-medium text-base">Domain Overview</span>
            </h2>
          </div>
          <p className="text-xs font-mono text-zinc-500 tracking-wider">
            Current date {currentTime}
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          {/* Active Monitoring Live Badge */}
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.08)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 scan-pulse" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
              En Vivo • Monitor Activo
            </span>
          </div>

          <button 
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 hover:text-cyan-400 transition-all px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-cyan-500/30 hover:bg-white/[0.04] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-cyan-400' : ''}`} /> 
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <div className="flex items-center gap-1.5 border border-white/[0.08] rounded-xl bg-white/[0.02] p-1">
            <button className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer">
              <Settings size={14} />
            </button>
            <button className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer">
              <MoreVertical size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Grid Layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Core Web Vitals Panel */}
        <div className="lg:col-span-2 flex flex-col p-6 rounded-2xl border border-white/[0.04] bg-[#081220]/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-colors duration-700" />
          
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">
                Core Web Vitals - Last 30 Days
              </h3>
              <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help hover:text-zinc-400 transition-colors" />
            </div>
            
            <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.08] px-2.5 py-1 rounded-lg text-[10px] text-zinc-400 font-bold uppercase tracking-wider cursor-pointer hover:bg-white/[0.05] transition-all">
              <span>Last 30m</span>
              <ChevronRight size={10} className="transform rotate-90" />
            </div>
          </div>

          {/* Core Web Vitals Cards 2x2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LCP Card */}
            <div className="backdrop-blur-md border border-white/[0.04] bg-white/[0.01] hover:border-cyan-500/20 rounded-xl p-5 flex flex-col gap-4 shadow-lg hover:shadow-cyan-500/[0.02] transition-all duration-300 relative group/card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  First Contentful Paint (LCP)
                  <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 uppercase tracking-wider">
                  Good
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-white">1.8s</span>
              </div>
              <div className="space-y-1.5">
                <div className="w-full bg-white/[0.03] h-1.5 rounded-full overflow-hidden p-[1px] border border-white/[0.02]">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full w-[85%] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-semibold tracking-wider uppercase mt-1">
                  <span className="text-emerald-400 font-bold">Status: Good</span>
                  <span>First Contentful Paint 1.8s</span>
                </div>
              </div>
            </div>

            {/* CLS Card */}
            <div className="backdrop-blur-md border border-white/[0.04] bg-white/[0.01] hover:border-cyan-500/20 rounded-xl p-5 flex flex-col gap-4 shadow-lg hover:shadow-cyan-500/[0.02] transition-all duration-300 relative group/card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  Cumulative Layout Shift (CLS)
                  <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 uppercase tracking-wider">
                  Good
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-white">0.03</span>
              </div>
              <div className="space-y-1.5">
                <div className="w-full bg-white/[0.03] h-1.5 rounded-full overflow-hidden p-[1px] border border-white/[0.02]">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full w-[92%] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-semibold tracking-wider uppercase mt-1">
                  <span className="text-emerald-400 font-bold">Details: Stable</span>
                  <span>Cumulative Layout Shift 0.03</span>
                </div>
              </div>
            </div>

            {/* INP Card with Sparkline */}
            <div className="backdrop-blur-md border border-white/[0.04] bg-white/[0.01] hover:border-cyan-500/20 rounded-xl p-5 flex flex-col gap-4 shadow-lg hover:shadow-cyan-500/[0.02] transition-all duration-300 relative overflow-hidden group/card">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.01] via-transparent to-transparent pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  Interaction to Next Paint (INP)
                  <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md border text-amber-400 bg-amber-500/10 border-amber-500/20 uppercase tracking-wider">
                  Needs Improvement
                </span>
              </div>
              <div className="flex items-baseline gap-2 relative z-10">
                <span className="text-3xl font-black tracking-tight text-white">210ms</span>
              </div>
              
              {/* Custom SVG Mini Sparkline chart to represent active monitoring */}
              <div className="h-12 w-full mt-1 relative z-10 overflow-hidden rounded-lg bg-zinc-950/20 border border-white/[0.02]">
                <svg className="w-full h-full" viewBox="0 0 300 60" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="yellowSparklineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(245, 158, 11, 0.25)" />
                      <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
                    </linearGradient>
                  </defs>
                  {/* Fill Area */}
                  <path 
                    d="M 0 50 Q 20 48, 45 42 T 90 46 T 135 25 T 180 40 T 225 15 T 270 38 T 300 45 L 300 60 L 0 60 Z" 
                    fill="url(#yellowSparklineGrad)" 
                  />
                  {/* Line */}
                  <path 
                    d="M 0 50 Q 20 48, 45 42 T 90 46 T 135 25 T 180 40 T 225 15 T 270 38 T 300 45" 
                    fill="none" 
                    stroke="rgba(245, 158, 11, 0.85)" 
                    strokeWidth="1.75" 
                    strokeLinecap="round"
                  />
                  {/* Glowing end point */}
                  <circle cx="300" cy="45" r="3" fill="#F59E0B" className="animate-ping" />
                  <circle cx="300" cy="45" r="2" fill="#F59E0B" />
                </svg>
              </div>

              <div className="space-y-1 relative z-10">
                <div className="w-full bg-white/[0.03] h-1.5 rounded-full overflow-hidden p-[1px] border border-white/[0.02]">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full w-[65%]" />
                </div>
                <div className="flex justify-between text-[9px] font-semibold tracking-wider uppercase mt-1">
                  <span className="text-amber-400 font-bold">Warning: 210mss</span>
                  <span className="text-zinc-500">paintinteraction in next paint</span>
                </div>
              </div>
            </div>

            {/* Overall Score Semicircular Gauge Card */}
            <div className="backdrop-blur-md border border-white/[0.04] bg-white/[0.01] hover:border-cyan-500/20 rounded-xl p-5 flex flex-col gap-3 shadow-lg hover:shadow-cyan-500/[0.02] transition-all duration-300 relative group/card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  Overall Performance Score
                  <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                </span>
                <span className="text-[9px] font-extrabold text-[#06b6d4]">INDEX 91.4</span>
              </div>

              {/* Semicircular SVG Gauge */}
              <div className="flex items-center justify-center h-28 relative mt-2">
                <svg className="w-40 h-24" viewBox="0 0 200 120">
                  <defs>
                    <linearGradient id="cyanArcGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#14B8A6" />
                      <stop offset="50%" stopColor="#22D3EE" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                    <filter id="cyanGlow" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.4" />
                    </filter>
                  </defs>
                  {/* Background Track */}
                  <path 
                    d="M 30,100 A 70,70 0 0,1 170,100" 
                    fill="none" 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="11" 
                    strokeLinecap="round" 
                  />
                  {/* Glowing Active Arc (91.4%) */}
                  {/* Half circumference is pi * 70 = 219.9. 91.4% length = 201.0. Dashoffset = 18.9 */}
                  <path 
                    d="M 30,100 A 70,70 0 0,1 170,100" 
                    fill="none" 
                    stroke="url(#cyanArcGrad)" 
                    strokeWidth="11" 
                    strokeLinecap="round" 
                    strokeDasharray="219.9" 
                    strokeDashoffset="18.9"
                    filter="url(#cyanGlow)"
                  />
                </svg>
                {/* Central Labels inside Semicircle */}
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-3">
                  <span className="text-4xl font-extrabold tracking-tighter text-white leading-none">91.4</span>
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mt-1.5 animate-pulse">
                    Excellent
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Side: Project Health Gauge Panel */}
        <div className="flex flex-col p-6 rounded-2xl border border-white/[0.04] bg-[#081220]/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/10 transition-colors duration-700" />
          
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">
                Project Health Gauge
              </h3>
              <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help hover:text-zinc-400 transition-colors" />
            </div>
          </div>

          {/* Complex SVG Concentric Health Circle */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-8">
            <div className="relative w-48 h-48 flex items-center justify-center">
              
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                <defs>
                  <filter id="healthGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#06b6d4" floodOpacity="0.45" />
                  </filter>
                </defs>
                {/* Base Dark Track */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="72" 
                  fill="none" 
                  stroke="rgba(255,255,255,0.02)" 
                  strokeWidth="11" 
                />

                {/* Zone Arc Segments */}
                {/* Circumference for r=72 is 2*pi*72 = 452.39 */}
                {/* Total gauge spans 270 degrees. Length = 452.39 * 270/360 = 339.3 */}
                {/* Gap is 113.1. We start at 135 degrees (transformed by rotate) */}
                {/* Segment 1: Critical (Red) 45 deg (span = 56.5px) */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="72" 
                  fill="none" 
                  stroke="#ef4444" 
                  strokeWidth="11" 
                  strokeDasharray="56.5 395.89" 
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform="rotate(135 100 100)"
                />
                {/* Segment 2: Warning (Orange) 60 deg (span = 75.4px) */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="72" 
                  fill="none" 
                  stroke="#f59e0b" 
                  strokeWidth="11" 
                  strokeDasharray="75.4 376.99" 
                  strokeDashoffset="-56.5"
                  transform="rotate(135 100 100)"
                />
                {/* Segment 3: Good (Teal) 165 deg (span = 207.4px) */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="72" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="11" 
                  strokeDasharray="207.4 245" 
                  strokeDashoffset="-131.9"
                  strokeLinecap="round"
                  transform="rotate(135 100 100)"
                />

                {/* Glowing Active Target Ring (94/100) overlay cursor/tracker */}
                {/* 94% of 270 degrees = 253.8 deg. Active arc length = 319 px */}
                <circle 
                  cx="100" 
                  cy="100" 
                  r="62" 
                  fill="none" 
                  stroke="#22d3ee" 
                  strokeWidth="3.5" 
                  strokeDasharray="291.6 160.8" 
                  strokeLinecap="round"
                  transform="rotate(135 100 100)"
                  filter="url(#healthGlow)"
                  className="animate-[dash_1.5s_ease-out_forwards]"
                />
              </svg>

              {/* Central Text Metrics */}
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                <span className="text-4xl font-black text-white tracking-tighter flex items-baseline">
                  94<span className="text-zinc-600 text-lg font-bold">/100</span>
                </span>
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                  Live Index
                </span>
              </div>
            </div>

            {/* Legend indicators */}
            <div className="flex items-center gap-6 justify-center w-full text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <span>Critical</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span>Good</span>
              </div>
            </div>

            {/* Centered overall health status */}
            <div className="text-center space-y-1 pt-2 w-full border-t border-white/[0.03]">
              <span className="block text-[9px] uppercase font-black tracking-widest text-zinc-500">
                Project Health Status:
              </span>
              <span className="block text-2xl font-black text-emerald-400 uppercase tracking-tight drop-shadow-[0_0_12px_rgba(52,211,153,0.3)] animate-pulse">
                Optimal
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* ─── Recent Projects Section ─── */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 px-1">
          <h3 className="font-extrabold text-white text-base tracking-tight uppercase tracking-wider">
            Recent Projects
          </h3>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 scan-pulse" />
        </div>

        {/* Dynamic Project Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dashboardData.map((project, idx) => {
            // Compute deterministic premium scores & labels mirroring screenshot specs
            let score = 91;
            let label = "Healthy";
            let type = "green";
            let IconComp = Globe;

            if (idx === 1) {
              score = 76;
              label = "Warning, CLS issues";
              type = "amber";
              IconComp = Globe;
            } else if (idx === 2) {
              score = 88;
              label = "Healthy";
              type = "green";
              IconComp = Terminal;
            } else if (idx > 2) {
              // Deterministic values for extra items beyond 3
              score = 80 + (idx * 7) % 19;
              type = score >= 90 ? 'green' : 'amber';
              label = type === 'green' ? 'Healthy' : 'Warning, layout shifts';
              IconComp = idx % 2 === 0 ? Terminal : Globe;
            }

            return (
              <div 
                key={project.id} 
                className="backdrop-blur-xl border border-white/[0.04] bg-[#091424]/70 hover:border-cyan-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden group hover:shadow-cyan-500/[0.02] hover:-translate-y-0.5 transition-all duration-300"
              >
                {/* Hover ambient highlight glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Left cyan glow band on hover */}
                <div className="absolute top-0 left-0 w-[3px] h-0 bg-cyan-400 group-hover:h-full transition-all duration-300" />

                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                      type === 'green'
                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20'
                        : 'bg-amber-500/5 border-amber-500/10 text-amber-400 group-hover:bg-amber-500/10 group-hover:border-amber-500/20'
                    }`}>
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-extrabold text-white text-base truncate tracking-tight">
                        {project.name}
                      </h4>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">
                        {project.domain}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-base font-black ${type === 'green' ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {score}/100
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.03] flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full animate-pulse ${type === 'green' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${type === 'green' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {label}
                    </span>
                  </div>

                  <Link 
                    href={`/projects/${project.id}`}
                    className="text-[9px] font-extrabold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 bg-cyan-500/10 border border-cyan-500/20 px-3.5 py-2 rounded-xl hover:bg-cyan-500/20"
                  >
                    Ver Auditoría <ChevronRight size={12} strokeWidth={2.5} />
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
