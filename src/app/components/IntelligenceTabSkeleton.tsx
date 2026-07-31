'use client';

import { Loader2 } from 'lucide-react';

export function IntelligenceTabSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 relative z-10 font-sans text-foreground min-h-[calc(100vh-140px)] animate-pulse">
      {/* ─── LEFT PANEL Skeleton ─────────────────── */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">
        {/* Project Selector */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5 space-y-3">
          <div className="h-3 w-24 bg-foreground/5 rounded-full" />
          <div className="h-11 w-full bg-foreground/5 rounded-xl" />
        </div>

        {/* History List */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl flex-1 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-border">
            <div className="h-3 w-32 bg-foreground/5 rounded-full" />
          </div>
          <div className="flex-1 divide-y divide-white/[0.04] p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2 py-3">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-28 bg-foreground/5 rounded-full" />
                  <div className="h-5 w-10 bg-foreground/5 rounded-md" />
                </div>
                <div className="h-2 w-20 bg-foreground/5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── RIGHT PANEL Skeleton ─────────── */}
      <div className="flex-1 flex flex-col gap-8 min-w-0">
        {/* Scan Launcher */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <div className="h-5 w-48 bg-foreground/5 rounded-full" />
            <div className="h-3 w-36 bg-foreground/5 rounded-full" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 h-12 bg-foreground/5 rounded-xl" />
            <div className="h-12 w-28 bg-foreground/5 rounded-xl" />
          </div>
        </div>

        {/* Posture Score + Vulnerabilities */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Score Gauge skeleton */}
          <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 flex flex-col items-center gap-4">
            <div className="h-3 w-20 bg-foreground/5 rounded-full" />
            <div className="w-36 h-36 rounded-full border-4 border-dashed border-border/30" />
          </div>

          {/* Summary skeleton */}
          <div className="md:col-span-2 backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 space-y-6">
            <div className="space-y-3">
              <div className="h-3 w-24 bg-foreground/5 rounded-full" />
              <div className="h-5 w-64 bg-foreground/5 rounded-full" />
              <div className="h-3 w-full bg-foreground/5 rounded-full" />
            </div>
            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border/50">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-muted/5 border border-border/50 p-3 rounded-xl flex flex-col items-center gap-2">
                  <div className="h-5 w-8 bg-foreground/5 rounded" />
                  <div className="h-2 w-12 bg-foreground/5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-fg/60 py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Cargando módulo de inteligencia cibernética...</span>
        </div>
      </div>
    </div>
  );
}
