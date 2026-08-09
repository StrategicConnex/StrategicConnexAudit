import { Suspense } from "react";
import { getRecentHealthChecks, getDailyAggregates, getModelHealthSummary, getLatestHealthCheck } from "./actions";
import { createClient } from "@/shared/lib/supabase/server";
import { redirect } from "next/navigation";
import { AiHealthDashboardClient } from "./health-dashboard.client";

export const dynamic = "force-dynamic";

export default async function AiHealthPage() {
  // 1. Auth guard — only authenticated users can see health data
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2. Fetch all data in parallel
  const [recent, daily, models, latest] = await Promise.all([
    getRecentHealthChecks(100),
    getDailyAggregates(30),
    getModelHealthSummary(),
    getLatestHealthCheck(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <Suspense fallback={<LoadingSkeleton />}>
        <AiHealthDashboardClient
          recent={recent}
          daily={daily}
          models={models}
          latest={latest}
        />
      </Suspense>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8 animate-pulse">
      <div className="h-8 w-64 bg-surface-muted rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-surface-muted rounded-xl" />
        ))}
      </div>
      <div className="h-80 bg-surface-muted rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-64 bg-surface-muted rounded-xl" />
        <div className="h-64 bg-surface-muted rounded-xl" />
      </div>
    </div>
  );
}
