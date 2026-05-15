'use client';

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground flex animate-pulse">
      {/* Sidebar Skeleton */}
      <aside className="w-64 border-r border-border/50 bg-card/30 hidden md:flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <div className="h-6 w-32 bg-white/5 rounded"></div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-white/5 rounded-lg"></div>
          ))}
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b border-border/50 flex items-center justify-between px-8">
          <div className="h-6 w-48 bg-white/5 rounded"></div>
          <div className="flex items-center gap-4">
            <div className="h-9 w-24 bg-white/5 rounded-lg"></div>
            <div className="w-9 h-9 rounded-full bg-white/5"></div>
          </div>
        </header>

        <div className="flex-1 p-8 space-y-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* KPI Stats Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 w-full bg-white/5 border border-white/10 rounded-xl"></div>
              ))}
            </div>

            {/* Content Area Skeleton */}
            <div className="h-96 w-full bg-white/5 border border-white/10 rounded-xl"></div>
          </div>
        </div>
      </main>
    </div>
  );
}
