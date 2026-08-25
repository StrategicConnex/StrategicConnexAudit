import { Suspense } from "react";
import { getRecentHealthChecks, getDailyAggregates, getModelHealthSummary, getLatestHealthCheck } from "./actions";
import { createClient } from "@/shared/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/admin";
import { AiHealthDashboardClient } from "./health-dashboard.client";

export const dynamic = "force-dynamic";

export default async function AiHealthPage() {
  // 1. Auth guard — only authenticated users can see health data
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2. Role gate — NO lanzador: un no-admin ve un 403 real, no un 500 del
  //    error boundary (las actions usan assertPlatformAdmin como 2ª capa).
  const gate = await requireAdmin();
  if (!gate.ok) {
    return <AccessDenied />;
  }

  // 3. Fetch all data in parallel
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

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl p-8 max-w-md text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 border border-destructive/20">
          <svg className="size-7 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground">Acceso restringido</h1>
        <p className="text-sm text-muted-fg leading-relaxed">
          El panel de salud de IA requiere rol <span className="font-semibold text-foreground">admin</span> de
          plataforma. Si crees que deberías tener acceso, contacta al administrador.
        </p>
      </div>
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
