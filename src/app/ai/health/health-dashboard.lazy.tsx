"use client";

import dynamic from "next/dynamic";
import type { AiHealthDashboardClientProps } from "./health-dashboard.client";

const AiHealthDashboardClient = dynamic(
  () =>
    import("./health-dashboard.client").then((mod) => ({
      default: mod.AiHealthDashboardClient,
    })),
  { ssr: false, loading: () => <LoadingSkeleton /> }
);

export function HealthDashboardLazy(props: AiHealthDashboardClientProps) {
  return <AiHealthDashboardClient {...props} />;
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
