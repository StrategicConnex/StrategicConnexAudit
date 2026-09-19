'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT ScoreGauge — gauge circular animado con color dinámico.
   value 0-100 (null = sin dato, muestra "—"). La animación es una
   transición CSS del dashoffset al montar (respeta motion-reduce).
   Semana 5 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

function gaugeColor(value: number) {
  if (value >= 80) return 'text-corporate-success';
  if (value >= 50) return 'text-corporate-warning';
  return 'text-corporate-danger';
}

/** Tono semántico compartido (gauge + barras). Fuente única de umbrales. */
export function scoreTone(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 80) return 'success';
  if (value >= 50) return 'warning';
  return 'danger';
}

function gaugeStroke(value: number) {
  if (value >= 80) return 'var(--corporate-success)';
  if (value >= 50) return 'var(--corporate-warning)';
  return 'var(--corporate-danger)';
}

export function ScoreGauge({
  value,
  size = 120,
  strokeWidth = 10,
  ariaLabel,
  className,
}: {
  /** 0-100. null = sin dato. */
  value: number | null;
  size?: number;
  strokeWidth?: number;
  ariaLabel: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = value == null ? 0 : Math.min(100, Math.max(0, value)) / 100;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--corporate-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={value == null ? 'var(--corporate-border)' : gaugeStroke(value)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? circumference * (1 - progress) : circumference}
          className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            'font-display text-2xl font-extrabold tabular-nums',
            value == null ? 'text-muted-fg' : gaugeColor(value),
          )}
        >
          {value == null ? '—' : Math.round(value)}
        </span>
      </div>
    </div>
  );
}
