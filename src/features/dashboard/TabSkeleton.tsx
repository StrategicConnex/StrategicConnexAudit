'use client';

/**
 * TabSkeleton — lightweight pulse skeleton shown while a lazy-loaded
 * dashboard tab chunk is being fetched (next/dynamic `loading` fallback).
 * Kept intentionally generic so every non-default tab shares the same
 * perceived-loading pattern without pulling in heavy chart libraries.
 */
export function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" role="status">
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="h-4 w-48 bg-foreground/5 rounded-full" />
        <div className="h-3 w-72 bg-foreground/5 rounded-full" />
        <div className="h-11 w-full bg-foreground/5 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card rounded-2xl p-6 space-y-3">
            <div className="h-3 w-24 bg-foreground/5 rounded-full" />
            <div className="h-8 w-36 bg-foreground/5 rounded-full" />
            <div className="h-2 w-full bg-foreground/5 rounded-full" />
            <div className="h-2 w-2/3 bg-foreground/5 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-fg/60 py-2">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <span>Cargando módulo...</span>
      </div>
    </div>
  );
}
