'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreGaugeProps {
  score: number;
  previousScore?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

function getScoreConfig(score: number) {
  if (score >= 85) return { label: 'Excelente', color: '#10b981', glow: 'rgba(16,185,129,0.5)', textColor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (score >= 70) return { label: 'Bueno', color: '#06b6d4', glow: 'rgba(6,182,212,0.5)', textColor: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' };
  if (score >= 50) return { label: 'Advertencia', color: '#f59e0b', glow: 'rgba(245,158,11,0.5)', textColor: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  if (score >= 30) return { label: 'Crítico', color: '#f97316', glow: 'rgba(249,115,22,0.5)', textColor: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' };
  return { label: 'Peligro', color: '#ef4444', glow: 'rgba(239,68,68,0.5)', textColor: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
}

export function ScoreGauge({ score, previousScore, size = 'md' }: ScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedDash, setAnimatedDash] = useState(0);

  const config = getScoreConfig(score);

  // Arc math: radius=54, circumference = 2*PI*r = ~339.3, but we only use 75% of the circle (270°)
  const radius = 54;
  const circumference = 2 * Math.PI * radius; // 339.3
  const arcFraction = 0.75; // 270° out of 360°
  const arcLength = circumference * arcFraction; // 254.5
  const dashOffset = arcLength - (animatedDash / 100) * arcLength;

  // Size config
  const svgSize = size === 'lg' ? 176 : size === 'sm' ? 120 : 148;
  const textSize = size === 'lg' ? 'text-5xl' : size === 'sm' ? 'text-2xl' : 'text-4xl';

  // Animate on mount / score change
  useEffect(() => {
    const duration = 1400;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setAnimatedScore(Math.round(eased * score));
      setAnimatedDash(eased * score);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [score]);

  const delta = previousScore != null ? score - previousScore : null;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Gauge SVG */}
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 140 140"
          className="transform -rotate-[135deg]"
        >
          <defs>
            <linearGradient id={`gauge-grad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={score < 50 ? '#ef4444' : score < 70 ? '#f59e0b' : '#10b981'} />
              <stop offset="100%" stopColor={config.color} />
            </linearGradient>
            <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset="0"
          />

          {/* Colored progress arc */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={`url(#gauge-grad-${score})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            filter="url(#gauge-glow)"
            style={{ transition: 'stroke-dashoffset 0.05s linear' }}
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = -135 + (tick / 100) * 270;
            const rad = (angle * Math.PI) / 180;
            const innerR = 46;
            const outerR = 54;
            const x1 = 70 + innerR * Math.cos(rad);
            const y1 = 70 + innerR * Math.sin(rad);
            const x2 = 70 + outerR * Math.cos(rad);
            const y2 = 70 + outerR * Math.sin(rad);
            return (
              <line
                key={tick}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {/* Center text overlay — NOT rotated */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`${textSize} font-black text-white leading-none tracking-tighter`}
            style={{ textShadow: `0 0 20px ${config.glow}` }}
          >
            {animatedScore}
          </span>
          <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest mt-0.5">/100</span>
        </div>

        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${config.glow.replace('0.5', '0.12')} 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* Label + Delta */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border uppercase tracking-widest ${config.bg} ${config.textColor}`}>
          {config.label}
        </span>

        {delta !== null && (
          <span className={`text-[10px] font-extrabold flex items-center gap-0.5 px-2 py-0.5 rounded-full border ${
            delta > 0
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : delta < 0
              ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
              : 'text-zinc-400 bg-white/[0.04] border-white/[0.06]'
          }`}>
            {delta > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : delta < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
    </div>
  );
}
