'use client';

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground flex animate-pulse">
      {/* Sidebar Skeleton */}
      <aside className="w-72 border-r border-border/50 bg-muted/80 hidden md:flex flex-col shrink-0">
        <div className="h-20 flex items-center px-8 border-b border-border/50">
          <div className="h-5 w-32 bg-foreground/5 rounded-full"></div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-foreground/5 rounded-xl"></div>
          ))}
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 border-b border-border/50 flex items-center justify-between px-10">
          <div className="h-6 w-56 bg-foreground/5 rounded-full"></div>
          <div className="flex items-center gap-6">
            <div className="h-10 w-28 bg-foreground/5 rounded-full"></div>
            <div className="w-10 h-10 rounded-full bg-foreground/5"></div>
          </div>
        </header>

        <div className="flex-1 p-10 space-y-10">
          <div className="max-w-[1400px] mx-auto space-y-10">
            {/* KPI Stats Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-40 w-full bg-card border border-border/50 rounded-xl"></div>
              ))}
            </div>

            {/* Content Area Skeleton */}
            <div className="h-[500px] w-full bg-card border border-border/50 rounded-xl"></div>
          </div>
        </div>
      </main>
    </div>
  );
}

