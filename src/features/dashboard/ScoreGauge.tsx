'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { useRealtimeMetrics } from '../../shared/hooks/useRealtimeMetrics';

interface ScoreGaugeProps {
  score: number;
  previousScore?: number | null;
  size?: 'sm' | 'md' | 'lg';
  projectId?: string;
  benchmark?: { value: number; label: string; rank: 'top' | 'above' | 'below' | 'bottom' } | null;
}

function getScoreConfig(score: number) {
  if (score >= 85) return { label: 'Excelente', color: '#8BC34A', glow: 'rgba(140,200,80,0.5)', textColor: 'text-chartreuse', bg: 'bg-chartreuse/10 border-chartreuse/20' };
  if (score >= 70) return { label: 'Bueno', color: '#6271C4', glow: 'rgba(98,113,196,0.5)', textColor: 'text-primary', bg: 'bg-primary/10 border-primary/20' };
  if (score >= 50) return { label: 'Advertencia', color: '#EBA52D', glow: 'rgba(235,165,45,0.5)', textColor: 'text-[oklch(75% 0.13 80)]', bg: 'bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20' };
  if (score >= 30) return { label: 'Crítico', color: '#D4373C', glow: 'rgba(212,55,60,0.5)', textColor: 'text-destructive/80', bg: 'bg-destructive/10 border-destructive/20' };
  return { label: 'Peligro', color: '#D4373C', glow: 'rgba(212,55,60,0.5)', textColor: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20' };
}

export function ScoreGauge({ score, previousScore, size = 'md', projectId, benchmark }: ScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedDash, setAnimatedDash] = useState(0);
  
  const { latestFinding, assetsDiscovered } = useRealtimeMetrics(projectId);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (latestFinding || assetsDiscovered > 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [latestFinding, assetsDiscovered]);

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
      <div className={`relative transition-transform duration-200 ${pulse ? 'scale-105' : 'scale-100'}`} style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 140 140"
          className="transform -rotate-[135deg]"
        >
          <defs>
            <linearGradient id={`gauge-grad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={score < 50 ? '#D4373C' : score < 70 ? '#EBA52D' : '#8BC34A'} />
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
            className={`${textSize} font-black text-foreground leading-none tracking-tighter`}
            style={{ textShadow: `0 0 20px ${config.glow}` }}
          >
            {animatedScore}
          </span>
          <span className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest mt-0.5">/100</span>
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
        <span className={`text-2xs font-extrabold px-3 py-1 rounded-full border uppercase tracking-widest ${config.bg} ${config.textColor}`}>
          {config.label}
        </span>

        {delta !== null && (
          <span className={`text-2xs font-extrabold flex items-center gap-0.5 px-2 py-0.5 rounded-full border ${
            delta > 0
              ? 'text-chartreuse bg-chartreuse/10 border-chartreuse/20'
              : delta < 0
              ? 'text-destructive bg-destructive/10 border-destructive/20'
              : 'text-muted-fg bg-muted/30 border-border'
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

      {/* Benchmark percentile badge */}
      {benchmark && (
        <div className={`text-2xs font-extrabold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
          benchmark.rank === 'top'
            ? 'text-chartreuse bg-chartreuse/10 border-chartreuse/20'
            : benchmark.rank === 'above'
            ? 'text-primary bg-primary/10 border-primary/20'
            : benchmark.rank === 'below'
            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            : 'text-destructive bg-destructive/10 border-destructive/20'
        }`}>
          {benchmark.rank === 'top' && <TrendingUp className="w-3 h-3" />}
          {benchmark.rank === 'above' && <TrendingUp className="w-3 h-3" />}
          {benchmark.rank === 'below' && <TrendingDown className="w-3 h-3" />}
          {benchmark.rank === 'bottom' && <Minus className="w-3 h-3" />}
          <span>vs {benchmark.label}: <strong>{benchmark.value}%</strong></span>
        </div>
      )}

      {/* Live Updates Indicator */}
      {projectId && (
        <div className="flex items-center gap-1 mt-1 opacity-70">
          <Activity className={`w-3 h-3 ${pulse ? 'text-blue-400 animate-pulse' : 'text-muted-fg'}`} />
          <span className="text-2xs font-medium text-muted-fg">
            Live metrics
          </span>
        </div>
      )}
    </div>
  );
}
